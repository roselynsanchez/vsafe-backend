const express = require('express');
const router = express.Router();
const { 
  obtenerVehiculos, 
  crearVehiculo, 
  actualizarVehiculo,
  eliminarVehiculo 
} = require('../controllers/vehiculosController');

router.get('/', obtenerVehiculos);
router.post('/', crearVehiculo);
router.put('/:id', actualizarVehiculo);   // ⭐ ESTA ES LA QUE FALTABA
router.delete('/:id', eliminarVehiculo);

module.exports = router;