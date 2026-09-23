const bcrypt = require('bcryptjs');
const pool = require('./config/db');

async function crearAdmin() {
  const password = 'admin123';  // ← cambia por la que quieras
  const hash = await bcrypt.hash(password, 10);
  
  try {
    await pool.query(
      `INSERT INTO usuarios (username, password_hash, nombre_completo, rol) 
       VALUES ('admin', ?, 'Administrador VSAFE', 'admin')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      [hash]
    );
    console.log('✅ Usuario admin creado/actualizado');
    console.log('   Usuario: admin');
    console.log('   Contraseña: admin123');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

crearAdmin();