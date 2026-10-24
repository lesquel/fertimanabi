# FertiManabí

Calculadora de fertilización por hectárea para cultivos de Manabí, Ecuador. Usa la **Ley del Mínimo de Liebig**: lo que pide el cultivo menos lo que ya aporta el suelo es el déficit que hay que cubrir con abono.

Es solo HTML, CSS y JavaScript. No necesita instalar nada.

## Cómo usarla

1. Abre `index.html` en el navegador (o la versión publicada en GitHub Pages).
2. Elige el cultivo.
3. Escribe tu análisis de suelo: N y P en ppm, K en cmol/kg o ppm.
4. Elige los fertilizantes que vas a usar para P, K y N.

La app muestra el déficit, los kilos y sacos de cada fertilizante y el costo total.

## Cálculo

| Paso | Fórmula |
|---|---|
| Factor del suelo | `ppm × profundidad (cm) × densidad (g/cm³) × 0.1 = kg/ha` (20 cm y 1.3 → ×2.6) |
| Fósforo | `P × 2.291 = P₂O₅` |
| Potasio | `cmol/kg × 391 = ppm`, luego `K × 1.205 = K₂O` |
| Déficit (Liebig) | `max(0, requerimiento − suelo)` |
| Abono | `déficit ÷ (% del nutriente / 100) ÷ eficiencia` |
| Costo | `kg ÷ 50 × precio del saco` |

Primero se cubre el P, luego el K y al final el N, descontando lo que ya aportó cada abono (por ejemplo, el N que trae el DAP).

## Extras

- **Comparar fórmulas:** prueba todas las combinaciones de fuentes de P, K y N entre los 25 fertilizantes (unas 4 000) y muestra las 5 más baratas para cubrir el mismo déficit. Con "Usar esta" se aplica la combinación.
- **Encalado:** si el pH está por debajo del rango del cultivo, calcula la cal. Con acidez intercambiable usa Kamprath (`1.5 × Al+H` t/ha de CaCO₃); sin ese dato, estima 2 t de CaCO₃ por unidad de pH. Se ajusta por el poder neutralizante de la cal elegida y se suma al costo.
- **Descargar Excel:** `.xlsx` con resultado, comparación, las dos bases de datos e historial.
- **Descargar PDF:** reporte listo para imprimir con análisis, Liebig, lista de compra, encalado y fórmulas más baratas.

## Bases de datos

- `data/fertilizers.js`: 25 fertilizantes tradicionales con N-P₂O₅-K₂O y precio por saco de 50 kg.
- `data/crops.js`: 50 rubros de Manabí con altitud, temperatura, lluvia, pH, tipo de suelo y requerimiento N-P₂O₅-K₂O (kg/ha por ciclo).

Los precios se pueden editar en la pestaña Fertilizantes. El botón **Descargar Excel** genera un `.xlsx` con el resultado, las dos bases de datos y el historial. Los precios y el historial se guardan en `localStorage`.

> Valores referenciales con fines académicos. Para recomendaciones de campo, consulte a un agrónomo.
