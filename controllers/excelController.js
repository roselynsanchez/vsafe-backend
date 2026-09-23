const xlsx = require('xlsx');
const fs = require('fs');
const pool = require('../config/db');
const { generarCodigoProducto } = require('./categoriasController');

const cargarExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo Excel' });

    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetInventario = workbook.Sheets['Inventario 2024'];
    let productosStock = [];

    if (sheetInventario) {
      const dataInv = xlsx.utils.sheet_to_json(sheetInventario, { header: 1 });

      for (let i = 2; i < dataInv.length; i++) {
        const fila = dataInv[i];
        if (!fila) continue;

        const colA = fila[1] ? String(fila[1]).trim() : '';
        const colB = fila[2] ? String(fila[2]).trim() : '';
        const colDesc = fila[3] ? String(fila[3]).trim() : '';

        if (!colA && !colB) continue;
        if (colA.toUpperCase().includes('DESCRIPCION') || colB.toUpperCase().includes('EXISTENCIA')) continue;

        // Material Balístico (LOT-...)
        if (colA.startsWith('LOT-') || colA.startsWith('ACE') || colA.startsWith('KEV')) {
          productosStock.push({
            nombre: colB,
            descripcion: colDesc || colB,
            id_categoria: 1,
            cantidad_disponible: parseFloat(fila[6]) || 0,
            nivel_balistico: 'NIJ III-A',
            unidad_medida: colA.includes('ACE') || colA.includes('TIT') ? 'kg' : 'm2'
          });
        } 
        // Insumos generales
        else if (colA !== '') {
          productosStock.push({
            nombre: colA,
            descripcion: colDesc || colA,
            id_categoria: 7,
            cantidad_disponible: parseFloat(colB) || parseFloat(fila[6]) || 0,
            nivel_balistico: 'N/A',
            unidad_medida: 'unidades'
          });
        }
      }
    }

    const conn = await pool.getConnection();
    let insertados = 0;
    
    try {
      await conn.beginTransaction();

      for (const prod of productosStock) {
        const codigo = await generarCodigoProducto(prod.id_categoria, conn);

        await conn.query(
          `INSERT INTO materiales 
            (codigo_producto, codigo_lote, id_categoria, nombre, descripcion, 
             cantidad_disponible, nivel_balistico, unidad_medida)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            codigo, codigo, prod.id_categoria, prod.nombre, prod.descripcion,
            prod.cantidad_disponible, prod.nivel_balistico, prod.unidad_medida
          ]
        );
        insertados++;
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ 
      mensaje: `Inventario procesado: ${insertados} materiales con códigos autogenerados`, 
      total: insertados 
    });

  } catch (error) {
    console.error('Error al procesar Excel:', error);
    res.status(500).json({ error: 'Error procesando el archivo: ' + error.message });
  }
};

module.exports = { cargarExcel };