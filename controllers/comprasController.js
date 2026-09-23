const pool = require('../config/db');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ============ LISTAR COMPRAS (con resumen de materiales) ============
const obtenerCompras = async (req, res) => {
  try {
    const [compras] = await pool.query(
      `SELECT 
        c.id_compra, c.numero_factura, c.fecha_compra, c.fecha_registro,
        c.estado, c.notas, c.total,
        p.id_proveedor, p.nombre AS proveedor, p.rif AS proveedor_rif,
        (SELECT COUNT(*) FROM compra_detalles WHERE id_compra = c.id_compra) AS total_materiales
       FROM compras c
       JOIN proveedores p ON c.id_proveedor = p.id_proveedor
       ORDER BY c.fecha_compra DESC, c.id_compra DESC
       LIMIT 500`
    );

    // Cargar los materiales de cada compra
    for (const compra of compras) {
      const [detalles] = await pool.query(
        `SELECT 
          cd.id_detalle, cd.id_material, cd.cantidad, cd.precio_unitario, cd.subtotal,
          m.nombre AS material, m.codigo_producto, m.unidad_medida
         FROM compra_detalles cd
         JOIN materiales m ON cd.id_material = m.id_material
         WHERE cd.id_compra = ?`,
        [compra.id_compra]
      );
      compra.detalles = detalles;
    }

    res.json(compras);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ COMPRAS POR PROVEEDOR ============
const obtenerComprasPorProveedor = async (req, res) => {
  const { id } = req.params;
  try {
    const [compras] = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM compra_detalles WHERE id_compra = c.id_compra) AS total_materiales
       FROM compras c
       WHERE c.id_proveedor = ?
       ORDER BY c.fecha_compra DESC`,
      [id]
    );

    for (const compra of compras) {
      const [detalles] = await pool.query(
        `SELECT cd.*, m.nombre AS material, m.unidad_medida
         FROM compra_detalles cd
         JOIN materiales m ON cd.id_material = m.id_material
         WHERE cd.id_compra = ?`,
        [compra.id_compra]
      );
      compra.detalles = detalles;
    }

    res.json(compras);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ CREAR COMPRA (multi-material) ============
const crearCompra = async (req, res) => {
  const { 
    id_proveedor, numero_factura, fecha_compra, 
    notas, estado, materiales 
  } = req.body;

  // Validaciones básicas
  if (!id_proveedor || !numero_factura || !fecha_compra) {
    return res.status(400).json({ 
      error: 'Faltan campos obligatorios: proveedor, número de factura y fecha' 
    });
  }

  if (!Array.isArray(materiales) || materiales.length === 0) {
    return res.status(400).json({ 
      error: 'Debes agregar al menos un material a la factura' 
    });
  }

  // Validar cada material
  for (const mat of materiales) {
    if (!mat.id_material || !mat.cantidad || !mat.precio_unitario) {
      return res.status(400).json({ 
        error: 'Cada material debe tener material, cantidad y precio' 
      });
    }
    if (parseFloat(mat.cantidad) <= 0 || parseFloat(mat.precio_unitario) <= 0) {
      return res.status(400).json({ 
        error: 'Cantidad y precio deben ser mayores a 0' 
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Calcular total
    const total = materiales.reduce(
      (sum, m) => sum + (parseFloat(m.cantidad) * parseFloat(m.precio_unitario)), 
      0
    );

    // 2. Insertar cabecera de la compra
    const [result] = await conn.query(
      `INSERT INTO compras 
        (id_proveedor, numero_factura, fecha_compra, notas, estado, total) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id_proveedor,
        numero_factura.trim().toUpperCase(),
        fecha_compra,
        notas || null,
        estado || 'recibida',
        total
      ]
    );
    const idCompra = result.insertId;

    // 3. Insertar detalles
    for (const mat of materiales) {
      const cantNum = parseFloat(mat.cantidad);
      const precNum = parseFloat(mat.precio_unitario);

      await conn.query(
        `INSERT INTO compra_detalles 
          (id_compra, id_material, cantidad, precio_unitario) 
         VALUES (?, ?, ?, ?)`,
        [idCompra, mat.id_material, cantNum, precNum]
      );

      // 4. Sumar stock (si la compra está recibida)
      if ((estado || 'recibida') === 'recibida') {
        await conn.query(
          `UPDATE materiales 
           SET cantidad_disponible = cantidad_disponible + ? 
           WHERE id_material = ?`,
          [cantNum, mat.id_material]
        );
      }
    }

    await conn.commit();
    res.json({ 
      mensaje: `Compra registrada con ${materiales.length} material(es)`,
      id: idCompra,
      total,
      stock_actualizado: (estado || 'recibida') === 'recibida'
    });

  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Ya existe una factura con ese número para este proveedor' 
      });
    }
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
};

// ============ ACTUALIZAR COMPRA ============
const actualizarCompra = async (req, res) => {
  const { id } = req.params;
  const { 
    id_proveedor, numero_factura, fecha_compra, 
    notas, estado, materiales 
  } = req.body;

  if (!Array.isArray(materiales) || materiales.length === 0) {
    return res.status(400).json({ error: 'Debes agregar al menos un material' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Obtener detalles viejos para revertir stock
    const [detallesViejos] = await conn.query(
      'SELECT id_material, cantidad FROM compra_detalles WHERE id_compra = ?',
      [id]
    );

    const [compraVieja] = await conn.query(
      'SELECT estado FROM compras WHERE id_compra = ?',
      [id]
    );

    if (compraVieja.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Compra no encontrada' });
    }

    // 2. Revertir stock si estaba recibida
    if (compraVieja[0].estado === 'recibida') {
      for (const d of detallesViejos) {
        await conn.query(
          `UPDATE materiales 
           SET cantidad_disponible = cantidad_disponible - ? 
           WHERE id_material = ?`,
          [d.cantidad, d.id_material]
        );
      }
    }

    // 3. Eliminar detalles viejos
    await conn.query('DELETE FROM compra_detalles WHERE id_compra = ?', [id]);

    // 4. Calcular nuevo total
    const total = materiales.reduce(
      (sum, m) => sum + (parseFloat(m.cantidad) * parseFloat(m.precio_unitario)), 
      0
    );

    // 5. Actualizar cabecera
    await conn.query(
      `UPDATE compras 
       SET id_proveedor = ?, numero_factura = ?, fecha_compra = ?, 
           notas = ?, estado = ?, total = ?
       WHERE id_compra = ?`,
      [
        id_proveedor,
        numero_factura.trim().toUpperCase(),
        fecha_compra,
        notas || null,
        estado || 'recibida',
        total,
        id
      ]
    );

    // 6. Insertar nuevos detalles + aplicar stock
    for (const mat of materiales) {
      const cantNum = parseFloat(mat.cantidad);
      const precNum = parseFloat(mat.precio_unitario);

      await conn.query(
        `INSERT INTO compra_detalles 
          (id_compra, id_material, cantidad, precio_unitario) 
         VALUES (?, ?, ?, ?)`,
        [id, mat.id_material, cantNum, precNum]
      );

      if ((estado || 'recibida') === 'recibida') {
        await conn.query(
          `UPDATE materiales 
           SET cantidad_disponible = cantidad_disponible + ? 
           WHERE id_material = ?`,
          [cantNum, mat.id_material]
        );
      }
    }

    await conn.commit();
    res.json({ mensaje: 'Compra actualizada correctamente', total });

  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
};

// ============ ELIMINAR COMPRA ============
const eliminarCompra = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [compra] = await conn.query(
      'SELECT estado FROM compras WHERE id_compra = ?',
      [id]
    );

    if (compra.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Compra no encontrada' });
    }

    // Revertir stock si estaba recibida
    if (compra[0].estado === 'recibida') {
      const [detalles] = await conn.query(
        'SELECT id_material, cantidad FROM compra_detalles WHERE id_compra = ?',
        [id]
      );
      for (const d of detalles) {
        await conn.query(
          `UPDATE materiales 
           SET cantidad_disponible = cantidad_disponible - ? 
           WHERE id_material = ?`,
          [d.cantidad, d.id_material]
        );
      }
    }

    // Al eliminar la compra, CASCADE borra los detalles
    await conn.query('DELETE FROM compras WHERE id_compra = ?', [id]);

    await conn.commit();
    res.json({ mensaje: 'Compra eliminada y stock revertido' });

  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
};

// ============ ESTADÍSTICAS ============
const obtenerEstadisticas = async (req, res) => {
  try {
    const [totales] = await pool.query(
      `SELECT 
        COUNT(*) AS total_compras,
        COALESCE(SUM(total), 0) AS monto_total,
        COALESCE((SELECT SUM(cantidad) FROM compra_detalles cd 
                  JOIN compras c ON cd.id_compra = c.id_compra 
                  WHERE c.estado = 'recibida'), 0) AS unidades_totales,
        COUNT(DISTINCT id_proveedor) AS proveedores_activos
       FROM compras 
       WHERE estado = 'recibida'`
    );

    const [porMes] = await pool.query(
      `SELECT 
        DATE_FORMAT(fecha_compra, '%Y-%m') AS mes,
        COUNT(*) AS compras,
        COALESCE(SUM(total), 0) AS monto
       FROM compras
       WHERE estado = 'recibida'
         AND fecha_compra >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY mes
       ORDER BY mes ASC`
    );

    res.json({
      totales: totales[0],
      porMes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ GENERAR PDF DE FACTURA ============
const generarFacturaPDF = async (req, res) => {
  const { id } = req.params;

  try {
    const [compras] = await pool.query(
      `SELECT 
        c.id_compra, c.numero_factura, c.fecha_compra, c.fecha_registro, 
        c.notas, c.estado, c.total,
        p.nombre AS proveedor, p.rif AS proveedor_rif, 
        p.telefono AS proveedor_telefono, p.email AS proveedor_email,
        p.direccion AS proveedor_direccion, p.persona_contacto
       FROM compras c
       JOIN proveedores p ON c.id_proveedor = p.id_proveedor
       WHERE c.id_compra = ?`,
      [id]
    );

    if (compras.length === 0) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }

    const compra = compras[0];

    const [detalles] = await pool.query(
      `SELECT 
        cd.cantidad, cd.precio_unitario, cd.subtotal,
        m.nombre AS material, m.codigo_producto, m.nivel_balistico, 
        m.unidad_medida, m.descripcion AS material_descripcion
       FROM compra_detalles cd
       JOIN materiales m ON cd.id_material = m.id_material
       WHERE cd.id_compra = ?`,
      [id]
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 
      `inline; filename=Factura_${compra.numero_factura}.pdf`
    );

    doc.pipe(res);

    // Logo de fondo (marca de agua)
    const rutaLogo = path.join(__dirname, '../logo_vsafe.png');
    const existeLogo = fs.existsSync(rutaLogo);

    if (existeLogo) {
      doc.save();
      doc.opacity(0.06);
      doc.image(rutaLogo, 150, 300, { width: 300 });
      doc.restore();
    }

    // Encabezado
    if (existeLogo) {
      doc.image(rutaLogo, 50, 45, { width: 70 });
    }

    doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold')
       .text('VSAFE BLINDAJES S.A.', existeLogo ? 130 : 50, 50);

    doc.fillColor('#475569').fontSize(9).font('Helvetica')
       .text('Sistema de Gestión, Trazabilidad e Inteligencia Balística', 
             existeLogo ? 130 : 50, 75);

    doc.fillColor('#64748b').fontSize(8)
       .text('RIF: J-XXXXXXXX-X  |  Tel: +58 000-0000000  |  contacto@vsafe.com', 
             existeLogo ? 130 : 50, 90);

    doc.moveTo(50, 115).lineTo(545, 115).strokeColor('#1e3a8a').lineWidth(2).stroke();

    // Título
    doc.moveDown(2);
    doc.fillColor('#1e3a8a').fontSize(16).font('Helvetica-Bold')
       .text('FACTURA DE COMPRA', { align: 'center' });

    doc.moveDown(0.3);
    doc.fillColor('#64748b').fontSize(9).font('Helvetica')
       .text(`Emitida el ${new Date(compra.fecha_registro).toLocaleDateString('es-ES')}`, 
             { align: 'center' });

    // Bloque factura + estado
    const y1 = doc.y + 20;
    doc.rect(50, y1, 250, 60).fillAndStroke('#eff6ff', '#1e3a8a');
    doc.rect(295, y1, 250, 60).fillAndStroke('#f0fdf4', '#16a34a');

    doc.fillColor('#1e3a8a').fontSize(8).font('Helvetica-Bold')
       .text('Nº DE FACTURA', 60, y1 + 10);
    doc.fillColor('#0f172a').fontSize(16)
       .text(compra.numero_factura, 60, y1 + 25);

    doc.fillColor('#16a34a').fontSize(8).font('Helvetica-Bold')
       .text('ESTADO', 305, y1 + 10);
    doc.fillColor('#0f172a').fontSize(14)
       .text(String(compra.estado).toUpperCase(), 305, y1 + 25);

    // Datos del proveedor
    const y2 = y1 + 85;
    doc.fillColor('#1e3a8a').fontSize(11).font('Helvetica-Bold')
       .text('DATOS DEL PROVEEDOR', 50, y2);

    doc.moveTo(50, y2 + 15).lineTo(545, y2 + 15).strokeColor('#cbd5e1').lineWidth(1).stroke();

    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold')
       .text(compra.proveedor, 50, y2 + 25);

    doc.fillColor('#475569').fontSize(9).font('Helvetica');
    let lineY = y2 + 42;
    if (compra.proveedor_rif) {
      doc.text(`RIF: ${compra.proveedor_rif}`, 50, lineY); lineY += 13;
    }
    if (compra.persona_contacto) {
      doc.text(`Contacto: ${compra.persona_contacto}`, 50, lineY); lineY += 13;
    }
    if (compra.proveedor_telefono) {
      doc.text(`Teléfono: ${compra.proveedor_telefono}`, 50, lineY); lineY += 13;
    }
    if (compra.proveedor_email) {
      doc.text(`Email: ${compra.proveedor_email}`, 50, lineY); lineY += 13;
    }
    if (compra.proveedor_direccion) {
      doc.text(`Dirección: ${compra.proveedor_direccion}`, 50, lineY, { width: 480 }); 
      lineY += 13;
    }

    // Detalle de la compra
    const y3 = lineY + 20;
    doc.fillColor('#1e3a8a').fontSize(11).font('Helvetica-Bold')
       .text('DETALLE DE LA COMPRA', 50, y3);

    // Cabecera de tabla
    const y4 = y3 + 20;
    doc.rect(50, y4, 495, 22).fill('#1e3a8a');
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    doc.text('MATERIAL', 60, y4 + 6, { width: 210 });
    doc.text('CANT.', 275, y4 + 6, { width: 55, align: 'right' });
    doc.text('P. UNIT.', 335, y4 + 6, { width: 80, align: 'right' });
    doc.text('SUBTOTAL', 420, y4 + 6, { width: 115, align: 'right' });

    // Filas de materiales
    let yRow = y4 + 22;
    detalles.forEach((d, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      const rowHeight = d.codigo_producto || d.nivel_balistico ? 45 : 32;

      doc.rect(50, yRow, 495, rowHeight).fillAndStroke(bg, '#e2e8f0');

      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold')
         .text(d.material, 60, yRow + 8, { width: 210 });

      // Sub-info
      let subY = yRow + 22;
      doc.fillColor('#64748b').fontSize(8).font('Helvetica');
      if (d.codigo_producto) {
        doc.text(`Cód: ${d.codigo_producto}`, 60, subY); subY += 10;
      }
      if (d.nivel_balistico && d.nivel_balistico !== 'N/A') {
        doc.text(`Nivel: ${d.nivel_balistico}`, 60, subY);
      }

      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold')
         .text(`${d.cantidad} ${d.unidad_medida || ''}`, 
               275, yRow + 12, { width: 55, align: 'right' });

      doc.font('Helvetica')
         .text(`$${Number(d.precio_unitario).toFixed(2)}`, 
               335, yRow + 12, { width: 80, align: 'right' });

      doc.fillColor('#16a34a').font('Helvetica-Bold')
         .text(`$${Number(d.subtotal).toFixed(2)}`, 
               420, yRow + 12, { width: 115, align: 'right' });

      yRow += rowHeight;
    });

    // Total general
    const yTotal = yRow + 15;
    doc.rect(345, yTotal, 200, 40).fillAndStroke('#1e3a8a', '#0f172a');
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
       .text('TOTAL:', 355, yTotal + 13);
    doc.fontSize(16)
       .text(`$${Number(compra.total).toFixed(2)}`, 400, yTotal + 10, 
             { width: 135, align: 'right' });

    // Notas
    if (compra.notas) {
      const yNotas = yTotal + 60;
      doc.fillColor('#1e3a8a').fontSize(10).font('Helvetica-Bold')
         .text('NOTAS:', 50, yNotas);
      doc.fillColor('#475569').fontSize(9).font('Helvetica')
         .text(compra.notas, 50, yNotas + 15, { width: 495 });
    }

    // Footer
    const yFooter = 740;
    doc.moveTo(50, yFooter).lineTo(545, yFooter)
       .strokeColor('#cbd5e1').lineWidth(1).stroke();

    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
       .text('Documento generado automáticamente por el Sistema VSAFE', 
             50, yFooter + 10, { align: 'center', width: 495 });
    doc.text('VSAFE BLINDAJES S.A. — Todos los derechos reservados', 
             50, yFooter + 22, { align: 'center', width: 495 });

    doc.end();

  } catch (error) {
    console.error('Error generando PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
};

// ============ CREAR ORDEN DE COMPRA DESDE SUGERENCIA IA ============
const crearCompraDesdeIA = async (req, res) => {
  const { 
    id_material, 
    cantidad_sugerida, 
    motivo,
    fecha_limite,
    nivel_alerta 
  } = req.body;

  if (!id_material || !cantidad_sugerida) {
    return res.status(400).json({ error: 'Falta id_material o cantidad_sugerida' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Obtener datos del material
    const [materiales] = await conn.query(
      'SELECT * FROM materiales WHERE id_material = ?',
      [id_material]
    );

    if (materiales.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Material no encontrado' });
    }

    const material = materiales[0];

    // 2. Buscar un proveedor que suministre este material
    const [proveedores] = await conn.query(
      `SELECT p.id_proveedor, p.nombre AS proveedor_nombre
       FROM proveedor_material pm
       JOIN proveedores p ON pm.id_proveedor = p.id_proveedor
       WHERE pm.id_material = ?
       LIMIT 1`,
      [id_material]
    );

    let idProveedor = null;
    let proveedorNombre = null;

    if (proveedores.length > 0) {
      idProveedor = proveedores[0].id_proveedor;
      proveedorNombre = proveedores[0].proveedor_nombre;
    } else {
      // Si no hay proveedor asignado, usar el primero disponible
      const [primerProv] = await conn.query(
        'SELECT id_proveedor, nombre FROM proveedores LIMIT 1'
      );
      if (primerProv.length > 0) {
        idProveedor = primerProv[0].id_proveedor;
        proveedorNombre = primerProv[0].nombre;
      } else {
        await conn.rollback();
        return res.status(400).json({ 
          error: 'No hay proveedores registrados. Crea uno primero.' 
        });
      }
    }

    // 3. Generar número de factura para la orden (ORD-XXXXX)
    const [ultimaOrden] = await conn.query(
      `SELECT numero_factura FROM compras 
       WHERE numero_factura LIKE 'ORD-%' 
       ORDER BY id_compra DESC LIMIT 1`
    );

    let siguienteNum = 1;
    if (ultimaOrden.length > 0) {
      const partes = ultimaOrden[0].numero_factura.split('-');
      siguienteNum = (parseInt(partes[1], 10) || 0) + 1;
    }
    const numeroOrden = `ORD-${String(siguienteNum).padStart(5, '0')}`;

    // 4. Crear la compra con estado "pendiente"
    const fechaHoy = new Date().toISOString().split('T')[0];
    const [resultCompra] = await conn.query(
      `INSERT INTO compras 
        (id_proveedor, numero_factura, fecha_compra, estado, notas, total) 
       VALUES (?, ?, ?, 'pendiente', ?, 0)`,
      [
        idProveedor,
        numeroOrden,
        fechaHoy,
        `⚠️ Orden generada automáticamente por el sistema IA\n` +
        `Motivo: ${motivo || 'Reposición de stock'}\n` +
        `Nivel de alerta: ${nivel_alerta || 'N/A'}\n` +
        `Fecha límite sugerida: ${fecha_limite || 'No definida'}`
      ]
    );

    const idCompra = resultCompra.insertId;

    // 5. Insertar el detalle de la compra
    await conn.query(
      `INSERT INTO compra_detalles 
        (id_compra, id_material, cantidad, precio_unitario) 
       VALUES (?, ?, ?, 0)`,
      [idCompra, id_material, cantidad_sugerida]
    );

    // 6. Crear evento en el calendario como recordatorio
    if (fecha_limite) {
      await conn.query(
        `INSERT INTO calendario_eventos 
          (titulo, descripcion, fecha, categoria, prioridad, recordatorio_dias) 
         VALUES (?, ?, ?, 'pago', 'urgente', 3)`,
        [
          `📦 Orden de compra ${numeroOrden} — ${material.nombre}`,
          `Comprar ${cantidad_sugerida} ${material.unidad_medida || 'unidades'} de ${material.nombre}. ` +
          `Motivo: ${motivo || 'Reposición automática por IA'}. Proveedor: ${proveedorNombre}.`,
          fecha_limite
        ]
      );
    }

    await conn.commit();

    res.json({
      mensaje: 'Orden de compra generada exitosamente',
      id_compra: idCompra,
      numero_orden: numeroOrden,
      proveedor: proveedorNombre,
      material: material.nombre,
      cantidad: cantidad_sugerida,
      unidad: material.unidad_medida
    });

  } catch (error) {
    await conn.rollback();
    console.error('Error creando orden desde IA:', error);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
};

module.exports = { 
  obtenerCompras, 
  obtenerComprasPorProveedor,
  crearCompra, 
  actualizarCompra, 
  eliminarCompra,
  obtenerEstadisticas,
  generarFacturaPDF,
  crearCompraDesdeIA   // ⭐ NUEVO
};
