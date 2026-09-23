const express = require('express');
const router = express.Router();
const { 
  login, 
  verificarToken, 
  autenticar,
  crearUsuario, 
  listarUsuarios, 
  cambiarPassword,
  eliminarUsuario 
} = require('../controllers/authController');

router.post('/login', login);
router.get('/verificar', autenticar, verificarToken);
router.post('/usuarios', autenticar, crearUsuario);
router.get('/usuarios', autenticar, listarUsuarios);
router.put('/usuarios/:id/password', autenticar, cambiarPassword);
router.delete('/usuarios/:id', autenticar, eliminarUsuario);

module.exports = router;