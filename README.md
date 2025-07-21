markdown

# 🛍️ Sistema de Procesamiento y Normalización de Datos de Productos

![Node.js](https://img.shields.io/badge/Node.js-16%2B-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Express](https://img.shields.io/badge/Express-4.18%2B-blue)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-yellow)

Sistema ETL (Extract, Transform, Load) completo con interfaz web para procesar y normalizar datos de productos desde archivos CSV, con capacidades de web scraping y exportación a archivos Excel organizados.

## 🌟 Características principales

### Backend (API REST)

- **Extracción automática** de datos desde archivos CSV
- **Web scraping inteligente** para descripciones y especificaciones
- **Normalización avanzada** de datos de productos
- Generación automática de **descripciones de productos**
- Asignación de **IDs únicos** para marcas y categorías
- **Procesamiento concurrente** configurable
- **API REST** para integración

### Frontend (Interfaz Web)

- **Dashboard intuitivo** para monitoreo del sistema
- **Configuración en tiempo real** de parámetros de procesamiento
- **Pruebas individuales** de productos
- **Log de actividad** en tiempo real
- **Estado del sistema** actualizado automáticamente

## 🛠 Tecnologías utilizadas

### Backend

- **Node.js** (Entorno de ejecución)
- **Express.js** (Framework web)
- **Axios** (Cliente HTTP para scraping)
- **Cheerio** (Parser HTML para scraping)
- **XLSX** (Librería para manejo de Excel)
- **p-limit** (Control de concurrencia)

### Frontend

- **HTML5** + **CSS3** + **Vanilla JavaScript**
- **CSS Grid** y **Flexbox** para layouts responsivos
- **Fetch API** para comunicación con backend

## 📦 Instalación

1. **Clona el repositorio:**

```bash
git clone https://github.com/AlexeiEvenepoel/Refinar-datos.git
cd Refinar-datos
```

2. **Instala las dependencias:**

```bash
npm install
```

3. **Coloca tu archivo CSV en el directorio `csv/`**

## 🏗️ Estructura del proyecto

```
Refinar-datos/
├── csv/                          # Archivos CSV de entrada
│   └── DCW_20250711060130.csv   # Archivo de datos de productos
├── output/                       # Archivos Excel generados
├── src/
│   ├── backend/                  # Servidor y API REST
│   │   ├── controllers/          # Controladores de rutas
│   │   ├── services/             # Lógica de negocio
│   │   ├── routes/               # Definición de rutas
│   │   └── server.js             # Servidor principal
│   └── frontend/                 # Interfaz web
│       ├── index.html            # Página principal
│       ├── styles.css            # Estilos CSS
│       └── script.js             # JavaScript del frontend
├── legacy/                       # Scripts originales (CLI)
│   ├── description-scraper.js    # Scraping de descripciones
│   ├── scraper.js                # Scraping de imágenes
│   ├── transform.js              # Transformación de datos
│   └── process-all.js            # Procesamiento completo
├── package.json
└── README.md
```

## 🚀 Cómo usar

### Opción 1: Interfaz Web (Recomendado)

1. **Inicia el servidor:**

```bash
npm start
```

2. **Abre tu navegador en:** `http://localhost:3000`

3. **Usa la interfaz web para:**
   - Configurar parámetros de procesamiento
   - Monitorear el estado del sistema
   - Procesar productos
   - Probar productos individuales

### Opción 2: Línea de Comandos (Legacy)

```bash
# Procesamiento estándar
npm run process

# Procesamiento completo con configuración personalizada
npm run process-full

# Probar velocidad y encontrar configuración óptima
npm run test-speed

# Probar un código de producto individual
npm run test-product ACTE70207W
```

## 📂 Formatos de salida

### productos.xlsx

| Campo       | Descripción                          | Tipo    |
| ----------- | ------------------------------------ | ------- |
| ProductCode | Código único del producto            | String  |
| Title       | Nombre del producto                  | String  |
| Description | Descripción generada automáticamente | String  |
| Price       | Precio del producto                  | Number  |
| CategoryID  | ID de la categoría (relación)        | Number  |
| BrandID     | ID de la marca (relación)            | Number  |
| Featured    | Producto destacado                   | Boolean |
| Stock       | Cantidad en stock                    | Number  |
| ImageUrl    | URL de la imagen del producto        | String  |

### brands.xlsx

| Campo | Descripción                     | Tipo   |
| ----- | ------------------------------- | ------ |
| ID    | Identificador único de la marca | Number |
| Name  | Nombre de la marca              | String |

### categories.xlsx

| Campo | Descripción                         | Tipo   |
| ----- | ----------------------------------- | ------ |
| ID    | Identificador único de la categoría | Number |
| Name  | Nombre de la categoría              | String |

## 🔧 API Endpoints

### GET `/api/products/status`

Obtiene el estado actual del sistema y archivos generados.

### POST `/api/products/process`

Inicia el procesamiento completo de productos.

```json
{
  "concurrencyTransform": 10,
  "concurrencyImages": 20,
  "concurrencyDescriptions": 15
}
```

### GET `/api/products/test/:productCode`

Prueba un producto específico para verificar scraping.

## ⚙️ Configuración

### Parámetros de Concurrencia

- **Transform**: Número de productos procesados simultáneamente (recomendado: 5-15)
- **Images**: Número de imágenes descargadas simultáneamente (recomendado: 10-30)
- **Descriptions**: Número de descripciones procesadas simultáneamente (recomendado: 10-20)

### Variables de Entorno

```bash
PORT=3000                    # Puerto del servidor (opcional)
NODE_ENV=production         # Entorno de ejecución (opcional)
```

## 🚨 Solución de Problemas

### Error: "Cannot find module"

```bash
npm install
```

### Error: "ENOENT: no such file or directory"

Asegúrate de que el archivo CSV esté en la carpeta `csv/`

### Problemas de Concurrencia

Reduce los valores de concurrencia si experimentas errores de red o timeouts.

## 🤝 Cómo contribuir

1. Haz un fork del proyecto
2. Crea tu rama de características (`git checkout -b feature/AmazingFeature`)
3. Haz commit de tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Haz push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🔗 Enlaces

- [Repositorio](https://github.com/AlexeiEvenepoel/Refinar-datos)
- [Documentación de la API](http://localhost:3000/api)
- [Reportar Issues](https://github.com/AlexeiEvenepoel/Refinar-datos/issues)
