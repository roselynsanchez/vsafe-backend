const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ⚠️ En producción, esto va en .env
const JWT_SECRET = process.env.JWT_SECRET || 'vsafe_secreto_super_seguro_2026';
const JWT_EXPIRES = '8h';

// ============ LOGIN ============
const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE username = ? AND activo = 1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const usuario = rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Actualizar último acceso
    await pool.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?',
      [usuario.id_usuario]
    );

    // Generar token
    const token = jwt.sign(
      { 
        id_usuario: usuario.id_usuario, 
        username: usuario.username,
        rol: usuario.rol 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        username: usuario.username,
        nombre_completo: usuario.nombre_completo,
        rol: usuario.rol
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// ============ VERIFICAR TOKEN ============
const verificarToken = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_usuario, username, nombre_completo, rol FROM usuarios WHERE id_usuario = ? AND activo = 1',
      [req.usuario.id_usuario]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }
    res.json({ usuario: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ MIDDLEWARE ============
const autenticar = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// ============ CREAR USUARIO (solo admin) ============
const crearUsuario = async (req, res) => {
  const { username, password, nombre_completo, rol } = req.body;

  if (!username || !password || !nombre_completo) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO usuarios (username, password_hash, nombre_completo, rol) VALUES (?, ?, ?, ?)',
      [username, hash, nombre_completo, rol || 'operario']
    );
    res.json({ mensaje: 'Usuario creado', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
};

// ============ LISTAR USUARIOS (solo admin) ============
const listarUsuarios = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_usuario, username, nombre_completo, rol, activo, ultimo_acceso, fecha_creacion FROM usuarios ORDER BY id_usuario DESC'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ CAMBIAR CONTRASEÑA ============
const cambiarPassword = async (req, res) => {
  const { id } = req.params;
  const { nueva_password } = req.body;
  if (!nueva_password || nueva_password.length < 6) {
    return res.status(400).json({ error: 'Contraseña muy corta (mínimo 6)' });
  }
  try {
    const hash = await bcrypt.hash(nueva_password, 10);
    await pool.query('UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?', [hash, id]);
    res.json({ mensaje: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ ELIMINAR USUARIO ============
const eliminarUsuario = async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.usuario.id_usuario) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }
  try {
    await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [id]);
    res.json({ mensaje: 'Usuario eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  login, 
  verificarToken, 
  autenticar,
  crearUsuario, 
  listarUsuarios, 
  cambiarPassword,
  eliminarUsuario 
};