const pool = require('../config/db');

const obtenerClientes = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, 
              (SELECT COUNT(*) FROM vehiculos v WHERE v.cliente = c.nombre) AS total_vehiculos
       FROM clientes c
       ORDER BY c.id_cliente DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const crearCliente = async (req, res) => {
  const { nombre, cedula_rif, telefono, email, direccion } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO clientes (nombre, cedula_rif, telefono, email, direccion) 
       VALUES (?, ?, ?, ?, ?)`,
      [nombre, cedula_rif || null, telefono || null, email || null, direccion || null]
    );
    res.json({ mensaje: 'Cliente registrado', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const eliminarCliente = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM clientes WHERE id_cliente = ?', [id]);
    res.json({ mensaje: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { obtenerClientes, crearCliente, eliminarCliente };