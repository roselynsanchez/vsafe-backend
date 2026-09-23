const pool = require('../config/db');
const { enviarAlertaStockBajo } = require('../services/emailService');

// ============ DISPARAR ALERTA SI EL STOCK BAJA ============
const verificarYAlertar = async (idMaterial, stockActual) => {
  try {
    const [rows] = await pool.query(
      `SELECT nombre, unidad_medida, stock_minimo, 
              email_alerta, email_alerta_2, email_alerta_3
       FROM materiales WHERE id_material = ?`,
      [idMaterial]
    );

    if (rows.length === 0) return;

    const material = rows[0];
    const stockMinimo = parseFloat(material.stock_minimo) || 15;

    if (stockActual > stockMinimo) return;

    // ⭐ Recopilar TODOS los correos (1, 2 y 3)
    const correos = [];
    if (material.email_alerta && material.email_alerta.trim() !== '') {
      correos.push(material.email_alerta.trim());
    }
    if (material.email_alerta_2 && material.email_alerta_2.trim() !== '') {
      correos.push(material.email_alerta_2.trim());
    }
    if (material.email_alerta_3 && material.email_alerta_3.trim() !== '') {
      correos.push(material.email_alerta_3.trim());
    }

    await enviarAlertaStockBajo({
      material: material.nombre,
      stockActual: stockActual,
      stockMinimo: stockMinimo,
      unidad: material.unidad_medida || 'unidades',
      destinatarios: correos.length > 0 ? correos : null
    });

  } catch (error) {
    console.error('Error verificando alerta:', error.message);
  }
};

// ============ REGISTRAR MOVIMIENTO (ENTRADA / SALIDA) ============
const registrarMovimiento = async (req, res) => {
  const { 
    id_material, id_vehiculo, tipo_movimiento, cantidad, 
    motivo_o_vehiculo, operario, numero_requisicion
  } = req.body;
  
  try {
    const cantNum = parseFloat(cantidad);
    const matId = parseInt(id_material);
    const vehiculoId = id_vehiculo ? parseInt(id_vehiculo) : null;
    const esEntrada = tipo_movimiento === 'ENTRADA';

    if (!esEntrada && (!numero_requisicion || numero_requisicion.trim() === '')) {
      return res.status(400).json({ 
        error: 'El número de requisición es obligatorio para las salidas' 
      });
    }

    await pool.query(
      `INSERT INTO trazabilidad_material 
        (id_material, id_vehiculo, tipo_movimiento, numero_requisicion, 
         cantidad_usada, detalle, operario_responsable) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        matId, 
        vehiculoId, 
        tipo_movimiento || 'SALIDA', 
        numero_requisicion ? numero_requisicion.trim().toUpperCase() : null,
        cantNum, 
        motivo_o_vehiculo || null, 
        operario
      ]
    );

    if (esEntrada) {
      await pool.query(
        `UPDATE materiales SET cantidad_disponible = cantidad_disponible + ? WHERE id_material = ?`,
        [cantNum, matId]
      );
    } else {
      await pool.query(
        `UPDATE materiales SET cantidad_disponible = cantidad_disponible - ? WHERE id_material = ?`,
        [cantNum, matId]
      );
    }

    const [rows] = await pool.query(
      'SELECT nombre, cantidad_disponible FROM materiales WHERE id_material = ?', 
      [matId]
    );

    if (!esEntrada && rows[0]) {
      const stockActual = parseFloat(rows[0].cantidad_disponible);
      await verificarYAlertar(matId, stockActual);
    }

    res.status(200).json({ 
      mensaje: `${tipo_movimiento || 'SALIDA'} registrada exitosamente${
        numero_requisicion ? ` (Req. ${numero_requisicion})` : ''
      }` 
    });

  } catch (error) {
    console.error("Error exacto en la base de datos:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// ============ OBTENER MOVIMIENTOS (HISTORIAL) ============
const obtenerMovimientos = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT 
        t.id_trazabilidad AS id, 
        m.nombre AS material, 
        IFNULL(t.tipo_movimiento, 'SALIDA') AS tipo, 
        t.cantidad_usada AS cantidad, 
        t.numero_requisicion,
        t.detalle, 
        t.operario_responsable AS operario, 
        t.fecha_aplicacion AS fecha
       FROM trazabilidad_material t
       JOIN materiales m ON t.id_material = m.id_material
       ORDER BY t.fecha_aplicacion DESC 
       LIMIT 100`
    );
    res.status(200).json(filas);
  } catch (error) {
    console.error("Error al consultar movimientos:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// ============ OBTENER PRÓXIMO NÚMERO DE REQUISICIÓN ============
const obtenerProximaRequisicion = async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    const prefijo = `REQ-${anioActual}-`;

    const [rows] = await pool.query(
      `SELECT numero_requisicion 
       FROM trazabilidad_material 
       WHERE numero_requisicion LIKE ? 
       ORDER BY numero_requisicion DESC 
       LIMIT 1`,
      [`${prefijo}%`]
    );

    let siguienteNumero = 1;
    if (rows.length > 0 && rows[0].numero_requisicion) {
      const partes = rows[0].numero_requisicion.split('-');
      const ultimoNumero = parseInt(partes[2], 10);
      if (!isNaN(ultimoNumero)) {
        siguienteNumero = ultimoNumero + 1;
      }
    }

    const proximaRequisicion = `${prefijo}${String(siguienteNumero).padStart(4, '0')}`;

    res.json({ 
      numero_requisicion: proximaRequisicion,
      anio: anioActual,
      consecutivo: siguienteNumero
    });

  } catch (error) {
    console.error('Error al generar requisición:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  registrarConsumo: registrarMovimiento, 
  registrarMovimiento, 
  obtenerMovimientos,
  obtenerProximaRequisicion
};