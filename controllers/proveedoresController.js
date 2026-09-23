const pool = require('../config/db');

// ============ LISTAR PROVEEDORES ============
const obtenerProveedores = async (req, res) => {
  try {
    const [proveedores] = await pool.query(
      'SELECT * FROM proveedores ORDER BY id_proveedor DESC'
    );

    for (const p of proveedores) {
      // Materiales que ofrece (catálogo)
      const [materiales] = await pool.query(
        `SELECT pm.id_material, pm.precio_unitario, 
                m.nombre, m.codigo_producto, m.unidad_medida
         FROM proveedor_material pm
         JOIN materiales m ON pm.id_material = m.id_material
         WHERE pm.id_proveedor = ?`,
        [p.id_proveedor]
      );

      // Totales de compras (resumen)
      const [stats] = await pool.query(
        `SELECT 
          COUNT(*) AS total_compras,
          COALESCE(SUM(total), 0) AS monto_total
         FROM compras 
         WHERE id_proveedor = ? AND estado = 'recibida'`,
        [p.id_proveedor]
      );

      p.materiales = materiales;
      p.total_compras = stats[0].total_compras;
      p.monto_total = stats[0].monto_total;
    }

    res.json(proveedores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ CREAR PROVEEDOR ============
const crearProveedor = async (req, res) => {
  const { 
    nombre, rif, telefono, email, direccion, 
    persona_contacto, notas, materiales 
  } = req.body;

  if (!nombre || nombre.trim().length < 3) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Insertar proveedor
    const [result] = await conn.query(
      `INSERT INTO proveedores 
        (nombre, rif, telefono, email, direccion, persona_contacto, notas) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, rif || null, telefono || null, email || null, 
       direccion || null, persona_contacto || null, notas || null]
    );
    const idProveedor = result.insertId;

    // 2. Insertar relación con materiales (si vienen)
    if (Array.isArray(materiales) && materiales.length > 0) {
      for (const mat of materiales) {
        await conn.query(
          `INSERT INTO proveedor_material (id_proveedor, id_material, precio_unitario) 
           VALUES (?, ?, ?)`,
          [idProveedor, mat.id_material, mat.precio_unitario || null]
        );
      }
    }

    await conn.commit();
    res.json({ mensaje: 'Proveedor registrado', id: idProveedor });

  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'El RIF ya está registrado' });
    }
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
};

// ============ ACTUALIZAR PROVEEDOR ============
const actualizarProveedor = async (req, res) => {
  const { id } = req.params;
  const { 
    nombre, rif, telefono, email, direccion, 
    persona_contacto, notas, materiales 
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Actualizar datos
    await conn.query(
      `UPDATE proveedores 
       SET nombre = ?, rif = ?, telefono = ?, email = ?, 
           direccion = ?, persona_contacto = ?, notas = ?
       WHERE id_proveedor = ?`,
      [nombre, rif || null, telefono || null, email || null,
       direccion || null, persona_contacto || null, notas || null, id]
    );

    // 2. Borrar relaciones viejas
    await conn.query('DELETE FROM proveedor_material WHERE id_proveedor = ?', [id]);

    // 3. Insertar nuevas
    if (Array.isArray(materiales) && materiales.length > 0) {
      for (const mat of materiales) {
        await conn.query(
          `INSERT INTO proveedor_material (id_proveedor, id_material, precio_unitario) 
           VALUES (?, ?, ?)`,
          [id, mat.id_material, mat.precio_unitario || null]
        );
      }
    }

    await conn.commit();
    res.json({ mensaje: 'Proveedor actualizado' });

  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
};

// ============ ELIMINAR PROVEEDOR ============
const eliminarProveedor = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM proveedores WHERE id_proveedor = ?', [id]);
    res.json({ mensaje: 'Proveedor eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ TOGGLE ACTIVO ============
const toggleActivo = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      'UPDATE proveedores SET activo = NOT activo WHERE id_proveedor = ?',
      [id]
    );
    res.json({ mensaje: 'Estado cambiado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  obtenerProveedores, 
  crearProveedor, 
  actualizarProveedor, 
  eliminarProveedor,
  toggleActivo
};