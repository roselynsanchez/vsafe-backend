const pool = require('../config/db');

// ============ LISTAR ============
const obtenerCategorias = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM materiales m WHERE m.id_categoria = c.id_categoria) AS total_materiales
       FROM categorias c
       ORDER BY c.nombre ASC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ CREAR ============
const crearCategoria = async (req, res) => {
  const { nombre, descripcion, prefijo } = req.body;

  if (!nombre || nombre.trim().length < 3) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
  }
  if (!prefijo || prefijo.trim().length < 2 || prefijo.trim().length > 5) {
    return res.status(400).json({ error: 'El prefijo debe tener entre 2 y 5 caracteres' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO categorias (nombre, descripcion, prefijo) VALUES (?, ?, ?)',
      [nombre.trim(), descripcion || null, prefijo.trim().toUpperCase()]
    );
    res.json({ mensaje: 'Categoría creada', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre o prefijo' });
    }
    res.status(500).json({ error: error.message });
  }
};

// ============ ACTUALIZAR ============
const actualizarCategoria = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, prefijo } = req.body;

  if (!nombre || nombre.trim().length < 3) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
  }
  if (!prefijo || prefijo.trim().length < 2 || prefijo.trim().length > 5) {
    return res.status(400).json({ error: 'El prefijo debe tener entre 2 y 5 caracteres' });
  }

  try {
    await pool.query(
      'UPDATE categorias SET nombre = ?, descripcion = ?, prefijo = ? WHERE id_categoria = ?',
      [nombre.trim(), descripcion || null, prefijo.trim().toUpperCase(), id]
    );
    res.json({ mensaje: 'Categoría actualizada' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre o prefijo' });
    }
    res.status(500).json({ error: error.message });
  }
};

// ============ ELIMINAR ============
const eliminarCategoria = async (req, res) => {
  const { id } = req.params;
  try {
    const [mat] = await pool.query(
      'SELECT COUNT(*) AS total FROM materiales WHERE id_categoria = ?',
      [id]
    );
    if (mat[0].total > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar: tiene ${mat[0].total} materiales asociados` 
      });
    }
    await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [id]);
    res.json({ mensaje: 'Categoría eliminada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ GENERADOR DE CÓDIGO (helper para materiales) ============
const generarCodigoProducto = async (id_categoria, conn = null) => {
  const conexion = conn || pool;

  const [catRows] = await conexion.query(
    'SELECT prefijo FROM categorias WHERE id_categoria = ?',
    [id_categoria]
  );

  if (catRows.length === 0 || !catRows[0].prefijo) {
    throw new Error('Categoría no encontrada o sin prefijo asignado');
  }

  const prefijo = catRows[0].prefijo;

  const [lastRows] = await conexion.query(
    `SELECT codigo_producto 
     FROM materiales 
     WHERE codigo_producto LIKE ? 
     ORDER BY CAST(SUBSTRING_INDEX(codigo_producto, '-', -1) AS UNSIGNED) DESC 
     LIMIT 1`,
    [`${prefijo}-%`]
  );

  let siguiente = 1;
  if (lastRows.length > 0 && lastRows[0].codigo_producto) {
    const partes = lastRows[0].codigo_producto.split('-');
    const ultimo = parseInt(partes[1], 10);
    if (!isNaN(ultimo)) siguiente = ultimo + 1;
  }

  return `${prefijo}-${String(siguiente).padStart(4, '0')}`;
};

module.exports = {
  obtenerCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  generarCodigoProducto
};