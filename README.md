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

## Bases de datos

- `data/fertilizers.js`: 25 fertilizantes tradicionales con N-P₂O₅-K₂O y precio por saco de 50 kg.
- `data/crops.js`: 50 rubros de Manabí con altitud, temperatura, lluvia, pH, tipo de suelo y requerimiento N-P₂O₅-K₂O (kg/ha por ciclo).

Los precios se pueden editar en la pestaña Fertilizantes. Los precios y el historial se guardan en `localStorage`.

> Valores referenciales con fines académicos. Para recomendaciones de campo, consulte a un agrónomo.
