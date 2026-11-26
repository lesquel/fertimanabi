# FertiManabí

Calculadora de fertilización por hectárea para cultivos de Manabí, Ecuador. Usa la **Ley del Mínimo de Liebig**: lo que pide el cultivo menos lo que ya aporta el suelo es el déficit que hay que cubrir con abono.

Es solo HTML, CSS y JavaScript. No necesita instalar nada.

¿No sabes de programación? Lee [cómo se hizo](docs/COMO-SE-HIZO.md), explicado en simple (también en [Word](docs/COMO-SE-HIZO.docx) y [PDF](docs/COMO-SE-HIZO.pdf)).

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

- **Unidades de superficie:** hectárea, m², cuadra (7 056 m²), manzana (6 989 m²) y acre (4 047 m²). Al cambiar la unidad se convierte el número, y el cálculo siempre se hace en hectáreas.
- **Etapa del cultivo:** ciclo completo, siembra y establecimiento (25 % N, 60 % P₂O₅, 30 % K₂O), crecimiento vegetativo (45 %, 25 %, 35 %) o floración y llenado (30 %, 15 %, 35 %). Liebig se calcula para el ciclo y la etapa toma su parte. La cal solo aparece en el ciclo completo o en la siembra.
- **Modo invernadero (fertirriego):** tamaños Casero (1 × 2 m, 10 L por riego), Pequeño (4 × 10 m, 100 L), Grande (20 × 50 m, 2 000 L) o Personalizado, con ancho y largo editables en m o cm; el área se calcula sola. Se registra cuántas plantas se siembran. En el casero y el pequeño todo sale en gramos y mililitros; en el grande pasa a kilos y sacos cuando hace falta: gramos por riego y por litro, gramos por planta y ml de mezcla por planta. Solo muestra abonos solubles y avisa si la mezcla pasa de 2 g/L.
- **Capacidad del tanque:** si el agua del riego no cabe en el tanque, la app la reparte en tandas y dice cuántos gramos van en cada una.
- **Compatibilidad en el tanque:** revisa cada par de abonos elegidos. El nitrato de calcio no se mezcla con fosfatos (MAP, DAP, 20-20-20) ni con sulfatos (sulfato de amonio, sulfato de potasio), porque forman sólidos que tapan los goteros. Si se eligen juntos, la app los separa en Tanque A y Tanque B. El nitrato de potasio con sulfato de potasio va con cuidado, porque juntos se disuelven menos. La pestaña Fertilizantes trae la tabla completa.
- **Densidad de siembra (opcional):** `plantas/ha = 10 000 ÷ (entre plantas × entre hileras) × plantas por sitio × % aprovechable`, y los gramos de abono por planta.
- **¿Es buen día para fertilizar?:** pronóstico de 3 días de Open-Meteo por cantón o GPS. No se recomienda con lluvia de 20 mm o más, con 10 mm o más y probabilidad de 70 % o más, ni con viento de 30 km/h o más.

- **Comparar fórmulas:** prueba todas las combinaciones de fuentes de P, K y N entre los 25 fertilizantes (unas 4 000) y muestra las 5 más baratas para cubrir el mismo déficit. Con "Usar esta" se aplica la combinación.
- **Encalado:** si el pH está por debajo del rango del cultivo, calcula la cal. Con acidez intercambiable usa Kamprath (`1.5 × Al+H` t/ha de CaCO₃); sin ese dato, estima 2 t de CaCO₃ por unidad de pH. Se ajusta por el poder neutralizante de la cal elegida y se suma al costo.
- **Descargar Excel:** `.xlsx` con resultado, comparación, las dos bases de datos e historial.
- **Descargar PDF:** reporte listo para imprimir con análisis, Liebig, lista de compra, encalado y fórmulas más baratas.

## Bases de datos

- `data/fertilizers.js`: 25 fertilizantes tradicionales con N-P₂O₅-K₂O y precio por saco de 50 kg.
- `data/crops.js`: 50 rubros de Manabí con altitud, temperatura, lluvia, pH, tipo de suelo y requerimiento N-P₂O₅-K₂O (kg/ha por ciclo).

Los precios se pueden editar en la pestaña Fertilizantes. El botón **Descargar Excel** genera un `.xlsx` con el resultado, las dos bases de datos y el historial. Los precios y el historial se guardan en `localStorage`.

> Valores referenciales con fines académicos. Para recomendaciones de campo, consulte a un agrónomo.
