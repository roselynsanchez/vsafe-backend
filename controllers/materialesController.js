const pool = require('../config/db');
const { generarCodigoProducto } = require('./categoriasController');

// Listar todos los materiales
const obtenerMateriales = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, COALESCE(c.nombre, 'General') AS categoria, c.prefijo AS categoria_prefijo
      FROM materiales m 
      LEFT JOIN categorias c ON m.id_categoria = c.id_categoria
      ORDER BY m.id_material ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Listar categorías (para el select del formulario)
const obtenerCategorias = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categorias ORDER BY nombre ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper: convertir "N/A" en null
const parsearTiempoProveedor = (valor) => {
  if (valor === 'N/A' || valor === null || valor === undefined || valor === '') return null;
  const num = parseInt(valor, 10);
  return isNaN(num) ? null : num;
};

// Helper: parsear stock mínimo
const parsearStockMinimo = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 15;
  const num = parseFloat(valor);
  return isNaN(num) || num < 0 ? 15 : num;
};

// Helper: limpiar correo (null si vacío)
const limpiarCorreo = (correo) => {
  if (!correo) return null;
  const limpio = String(correo).trim();
  return limpio === '' ? null : limpio;
};

// ============ CREAR MATERIAL ============
const crearMaterial = async (req, res) => {
  const { 
    codigo_producto, codigo_lote, id_categoria, nombre, descripcion,
    nivel_balistico, cantidad_disponible, stock_minimo, 
    email_alerta, email_alerta_2, email_alerta_3,
    unidad_medida, fecha_ingreso, tiempo_proveedor_dias 
  } = req.body;

  if (!nombre || !nivel_balistico || cantidad_disponible === undefined || !unidad_medida) {
    return res.status(400).json({ 
      error: 'Faltan campos: nombre, nivel_balistico, cantidad_disponible, unidad_medida' 
    });
  }

  const tiempoProveedorFinal = parsearTiempoProveedor(tiempo_proveedor_dias);
  const stockMinimoFinal = parsearStockMinimo(stock_minimo);

  try {
    const categoriaFinal = id_categoria || 1;

    // Autogenerar código si no viene
    let codigoFinal = codigo_producto;
    if (!codigoFinal || codigoFinal.trim() === '') {
      codigoFinal = await generarCodigoProducto(categoriaFinal);
    }

    const loteFinal = codigo_lote || codigoFinal;

    const [result] = await pool.query(
      `INSERT INTO materiales 
        (codigo_producto, codigo_lote, id_categoria, nombre, descripcion, 
         nivel_balistico, cantidad_disponible, stock_minimo, 
         email_alerta, email_alerta_2, email_alerta_3,
         unidad_medida, fecha_ingreso, tiempo_proveedor_dias) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoFinal,
        loteFinal,
        categoriaFinal,
        nombre,
        descripcion || null,
        nivel_balistico,
        cantidad_disponible,
        stockMinimoFinal,
        limpiarCorreo(email_alerta),
        limpiarCorreo(email_alerta_2),
        limpiarCorreo(email_alerta_3),
        unidad_medida,
        fecha_ingreso || new Date().toISOString().split('T')[0],
        tiempoProveedorFinal
      ]
    );
    res.json({ 
      mensaje: 'Material registrado exitosamente', 
      id: result.insertId,
      codigo_generado: codigoFinal
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'El código de producto o lote ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
};

// ============ ACTUALIZAR MATERIAL ============
const actualizarMaterial = async (req, res) => {
  const { id } = req.params;
  const { 
    codigo_producto, codigo_lote, id_categoria, nombre, descripcion,
    nivel_balistico, cantidad_disponible, stock_minimo, 
    email_alerta, email_alerta_2, email_alerta_3,
    unidad_medida, fecha_ingreso, tiempo_proveedor_dias 
  } = req.body;

  const tiempoProveedorFinal = parsearTiempoProveedor(tiempo_proveedor_dias);
  const stockMinimoFinal = parsearStockMinimo(stock_minimo);

  try {
    await pool.query(
      `UPDATE materiales 
       SET codigo_producto = ?, codigo_lote = ?, id_categoria = ?, nombre = ?, 
           descripcion = ?, nivel_balistico = ?, cantidad_disponible = ?, 
           stock_minimo = ?, email_alerta = ?, email_alerta_2 = ?, email_alerta_3 = ?,
           unidad_medida = ?, fecha_ingreso = ?, tiempo_proveedor_dias = ?
       WHERE id_material = ?`,
      [
        codigo_producto || null, 
        codigo_lote, 
        id_categoria || 1, 
        nombre,
        descripcion || null, 
        nivel_balistico, 
        cantidad_disponible, 
        stockMinimoFinal,
        limpiarCorreo(email_alerta),
        limpiarCorreo(email_alerta_2),
        limpiarCorreo(email_alerta_3),
        unidad_medida,
        fecha_ingreso, 
        tiempoProveedorFinal, 
        id
      ]
    );
    res.json({ mensaje: 'Material actualizado correctamente' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'El código de producto o lote ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
};

// ============ ELIMINAR MATERIAL ============
const eliminarMaterial = async (req, res) => {
  const { id } = req.params;
  try {
    const [movs] = await pool.query(
      'SELECT COUNT(*) AS total FROM trazabilidad_material WHERE id_material = ?', 
      [id]
    );
    if (movs[0].total > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar: tiene ${movs[0].total} movimientos asociados` 
      });
    }
    await pool.query('DELETE FROM materiales WHERE id_material = ?', [id]);
    res.json({ mensaje: 'Material eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const vaciarMateriales = async (req, res) => {
  try {
    await pool.query('DELETE FROM materiales');
    await pool.query('ALTER TABLE materiales AUTO_INCREMENT = 1');
    res.json({ mensaje: 'Tabla de materiales vaciada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  obtenerMateriales, 
  obtenerCategorias,
  crearMaterial, 
  actualizarMaterial,
  eliminarMaterial,
  vaciarMateriales 
};