const pool = require('../config/db');

// ============ LISTAR ============
const obtenerVehiculos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM vehiculos ORDER BY id_vehiculo DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ CREAR ============
const crearVehiculo = async (req, res) => {
  const { vin_chasis, marca_modelo, placa, cliente, estado_proceso, tipo_servicio } = req.body;
  
  if (!vin_chasis || !marca_modelo || !cliente) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: VIN, marca/modelo y cliente' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO vehiculos 
        (vin_chasis, marca_modelo, placa, cliente, estado_proceso, tipo_servicio) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        vin_chasis, 
        marca_modelo, 
        placa || null, 
        cliente, 
        estado_proceso || 'Ingresado',
        tipo_servicio || 'Blindaje'
      ]
    );
    res.json({ mensaje: 'Vehículo registrado', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'El VIN o la placa ya existen' });
    }
    res.status(500).json({ error: error.message });
  }
};

// ============ ACTUALIZAR ⭐ (el que faltaba) ============
const actualizarVehiculo = async (req, res) => {
  const { id } = req.params;
  const { vin_chasis, marca_modelo, placa, cliente, estado_proceso, tipo_servicio } = req.body;

  if (!vin_chasis || !marca_modelo || !cliente) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: VIN, marca/modelo y cliente' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE vehiculos 
       SET vin_chasis = ?, 
           marca_modelo = ?, 
           placa = ?, 
           cliente = ?, 
           estado_proceso = ?, 
           tipo_servicio = ?
       WHERE id_vehiculo = ?`,
      [
        vin_chasis,
        marca_modelo,
        placa || null,
        cliente,
        estado_proceso || 'Ingresado',
        tipo_servicio || 'Blindaje',
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    res.json({ mensaje: 'Vehículo actualizado correctamente' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'El VIN o la placa ya existen en otro vehículo' });
    }
    res.status(500).json({ error: error.message });
  }
};

// ============ ELIMINAR ============
const eliminarVehiculo = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM vehiculos WHERE id_vehiculo = ?', [id]);
    res.json({ mensaje: 'Vehículo eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  obtenerVehiculos, 
  crearVehiculo, 
  actualizarVehiculo,
  eliminarVehiculo 
};