markdown

# 🛍️ Sistema de Procesamiento y Normalización de Datos de Productos

![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![License](https://img.shields.io/badge/License-MIT-blue)
[![GitHub Issues](https://img.shields.io/github/issues/AlexeiEvenepoel/Refinar-datos)](https://github.com/AlexeiEvenepoel/Refinar-datos/issues)
[![GitHub Stars](https://img.shields.io/github/stars/AlexeiEvenepoel/Refinar-datos)](https://github.com/AlexeiEvenepoel/Refinar-datos/stargazers)

Herramienta ETL (Extract, Transform, Load) para procesar y normalizar datos de productos desde archivos CSV a una estructura de base de datos relacional, exportando a archivos Excel organizados.

## 🌟 Características principales

- **Extracción automática** de datos desde archivos CSV
- **Normalización inteligente** de datos de productos
- Generación automática de **descripciones de productos**
- Asignación de **IDs únicos** para marcas y categorías
- Manejo avanzado de **stock y precios**
- Exportación a **múltiples archivos Excel** interrelacionados
- Procesamiento por lotes

## 🛠 Tecnologías utilizadas

- **Node.js** (Entorno de ejecución)
- **XLSX** (Librería para manejo de Excel)
- **JavaScript ES6+** (Modernas características de JS)
- **FS** (Manejo de archivos del sistema)

## 📦 Instalación

1. Clona el repositorio:

```bash
git clone https://github.com/AlexeiEvenepoel/Refinar-datos.git
Instala las dependencias:

bash
npm install
🏗️ Estructura del proyecto
Refinar-datos/
├── csv/                  # Directorio para archivos CSV de entrada
├── output/               # Archivos Excel generados
├── src/                  # Código fuente
│   ├── processors/       # Lógica de procesamiento
│   ├── utils/            # Utilidades
│   └── index.js          # Punto de entrada
├── package.json
└── README.md
🚀 Cómo usar
Coloca tu archivo CSV en el directorio csv/

Ejecuta el script principal:

bash
npm start
Encuentra los archivos procesados en output/

📂 Formatos de salida
productos_refinados.xlsx
Campo	Descripción	Tipo
Title	Nombre del producto	String
Description	Descripción generada automáticamente	String
Price	Precio del producto	Number
CategoryID	ID de la categoría (relación)	Number
BrandID	ID de la marca (relación)	Number
Stock	Cantidad en stock	Number
ProductCode	Código único del producto	String
brands.xlsx
Campo	Descripción	Tipo
ID	Identificador único de la marca	Number
Name	Nombre de la marca	String
categories.xlsx
Campo	Descripción	Tipo
ID	Identificador único de la categoría	Number
Name	Nombre de la categoría	String
🤝 Cómo contribuir
¡Agradecemos las contribuciones! Sigue estos pasos:

Haz un fork del proyecto

Crea tu rama de características (git checkout -b feature/AmazingFeature)

Haz commit de tus cambios (git commit -m 'Add some AmazingFeature')

Haz push a la rama (git push origin feature/AmazingFeature)

Abre un Pull Request


🔗 Enlace al proyecto: https://github.com/AlexeiEvenepoel/Refinar-datos

# Probar velocidad y encontrar configuración óptima
node process-all.js test-speed

# Ejecutar con concurrencia personalizada
node process-all.js full 10 20 15
# (donde 10=concurrenciaTrasform, 20=concurrenciaImágenes, 15=concurrenciaDescripciones)

# Probar un código de producto individual
node description-scraper.js ACTE70207W
```
