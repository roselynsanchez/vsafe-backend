const express = require('express');
const router = express.Router();
const { obtenerClientes, crearCliente, eliminarCliente } = require('../controllers/clientesController');

router.get('/', obtenerClientes);
router.post('/', crearCliente);
router.delete('/:id', eliminarCliente);

module.exports = router;