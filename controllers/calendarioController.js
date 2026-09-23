const pool = require('../config/db');

// ============ LISTAR EVENTOS (con filtros) ============
const obtenerEventos = async (req, res) => {
  try {
    const { desde, hasta, categoria, completado } = req.query;
    
    let query = 'SELECT * FROM calendario_eventos WHERE 1=1';
    const params = [];

    if (desde) { query += ' AND fecha >= ?'; params.push(desde); }
    if (hasta) { query += ' AND fecha <= ?'; params.push(hasta); }
    if (categoria && categoria !== 'todas') {
      query += ' AND categoria = ?';
      params.push(categoria);
    }
    if (completado !== undefined && completado !== 'todas') {
      query += ' AND completado = ?';
      params.push(completado === 'true' ? 1 : 0);
    }

    query += ' ORDER BY fecha ASC, hora ASC, prioridad DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ HELPER: VALIDAR FECHA PASADA ============
const esFechaPasada = (fechaStr) => {
  if (!fechaStr) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr + 'T00:00:00');
  return fecha < hoy;
};

// ============ CREAR ============
const crearEvento = async (req, res) => {
  const { 
    titulo, descripcion, fecha, hora, hora_fin, 
    categoria, prioridad, recordatorio_dias, color,
    confirmar_pasado
  } = req.body;

  if (!titulo || !fecha) {
    return res.status(400).json({ error: 'Título y fecha son obligatorios' });
  }

  // Validar fecha pasada
  if (esFechaPasada(fecha) && !confirmar_pasado) {
    return res.status(400). json({ 
      error: 'La fecha está en el pasado. Debes confirmar para continuar.',
      requiere_confirmacion: true
    });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO calendario_eventos 
        (titulo, descripcion, fecha, hora, hora_fin, categoria, prioridad, recordatorio_dias, color) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        titulo,
        descripcion || null,
        fecha,
        hora || null,
        hora_fin || null,
        categoria || 'recordatorio',
        prioridad || 'media',
        recordatorio_dias || 1,
        color || null
      ]
    );
    res.json({ mensaje: 'Evento creado', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ ACTUALIZAR ============
const actualizarEvento = async (req, res) => {
  const { id } = req.params;
  const { 
    titulo, descripcion, fecha, hora, hora_fin, 
    categoria, prioridad, recordatorio_dias, color,
    confirmar_pasado
  } = req.body;

  if (!titulo || !fecha) {
    return res.status(400).json({ error: 'Título y fecha son obligatorios' });
  }

  // Validar fecha pasada
  if (esFechaPasada(fecha) && !confirmar_pasado) {
    return res.status(400).json({ 
      error: 'La fecha está en el pasado. Debes confirmar para continuar.',
      requiere_confirmacion: true
    });
  }

  try {
    await pool.query(
      `UPDATE calendario_eventos 
       SET titulo = ?, descripcion = ?, fecha = ?, hora = ?, hora_fin = ?, 
           categoria = ?, prioridad = ?, recordatorio_dias = ?, color = ?
       WHERE id_evento = ?`,
      [
        titulo, descripcion || null, fecha, hora || null, hora_fin || null,
        categoria, prioridad, recordatorio_dias || 1, color || null, id
      ]
    );
    res.json({ mensaje: 'Evento actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ TOGGLE COMPLETADO ============
const toggleCompletado = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      'UPDATE calendario_eventos SET completado = NOT completado WHERE id_evento = ?',
      [id]
    );
    res.json({ mensaje: 'Estado actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ ELIMINAR ============
const eliminarEvento = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM calendario_eventos WHERE id_evento = ?', [id]);
    res.json({ mensaje: 'Evento eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ PRÓXIMOS / ALERTAS ============
const obtenerProximosEventos = async (req, res) => {
  try {
    const [vencidos] = await pool.query(
      `SELECT * FROM calendario_eventos 
       WHERE completado = 0 AND fecha < CURDATE()
       ORDER BY fecha DESC`
    );

    const [hoy] = await pool.query(
      `SELECT * FROM calendario_eventos 
       WHERE completado = 0 AND fecha = CURDATE()
       ORDER BY hora ASC, prioridad DESC`
    );

    const [proximos] = await pool.query(
      `SELECT * FROM calendario_eventos 
       WHERE completado = 0 
         AND fecha > CURDATE()
         AND DATEDIFF(fecha, CURDATE()) <= recordatorio_dias
       ORDER BY fecha ASC, hora ASC`
    );

    res.json({
      vencidos,
      hoy,
      proximos,
      total_pendientes: vencidos.length + hoy.length + proximos.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ ESTADÍSTICAS ============
const obtenerEstadisticas = async (req, res) => {
  try {
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN completado = 0 AND fecha >= CURDATE() THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN completado = 0 AND fecha < CURDATE() THEN 1 ELSE 0 END) AS vencidos,
        SUM(CASE WHEN completado = 1 THEN 1 ELSE 0 END) AS completados,
        SUM(CASE WHEN DATE(fecha) = CURDATE() AND completado = 0 THEN 1 ELSE 0 END) AS hoy
       FROM calendario_eventos`
    );
    res.json(stats[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ AÑOS DISPONIBLES ============
const obtenerAnios = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT YEAR(fecha) AS anio 
       FROM calendario_eventos 
       ORDER BY anio DESC`
    );
    const anioActual = new Date().getFullYear();
    const anios = rows.map(r => r.anio).filter(Boolean);
    
    if (!anios.includes(anioActual)) anios.push(anioActual);
    anios.sort((a, b) => b - a);
    
    res.json({ anios, anio_actual: anioActual });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  obtenerEventos,
  crearEvento,
  actualizarEvento,
  toggleCompletado,
  eliminarEvento,
  obtenerProximosEventos,
  obtenerEstadisticas,
  obtenerAnios
};
