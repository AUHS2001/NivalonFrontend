# Nivalon - Medical Imaging Platform

Nivalon is a medical imaging platform built on top of [OHIF Viewer](https://ohif.org/) (Open Health Imaging Foundation). It extends the OHIF Viewer with advanced 3D STL visualization capabilities for spinal cord analysis and medical imaging workflows.

## Prerequisites

- **Node.js**: Version 20 or higher (minimum required)
- **Yarn**: Package manager

### Check Node Version

```bash
node --version
# Should output v20.x.x or higher
```

## Installation

1. Clone the repository

2. Install dependencies:

```bash
yarn install
```

## Running the Application

### Development Mode

```bash
yarn run dev
```

This will start the development server. The application will be available at `http://localhost:3000` (or the configured port).

### Production Build

```bash
yarn run build
```

## Features

- DICOM image viewing (Axial, Sagittal, Coronal views)
- 3D STL model visualization
- Spine labeling and annotation
- Bone removal tools
- Measurement tools (distance and angle)
- Implant placement and manipulation
- Center line alignment
- STL to DICOM linking
- Version history tracking
- Screenshot capture
- Brightness adjustment

## Project Structure

```
ViewerTest/
├── extensions/
│   ├── stl-extention/       # 3D STL visualization extension
│   ├── cornerstone/         # Cornerstone.js integration
│   └── default/             # Default OHIF extension
├── platform/
│   ├── app/                 # Main application
│   ├── core/                # Core utilities
│   └── ui-next/             # UI components
├── modes/                   # Viewer modes configuration
└── .webpack/                # Webpack configuration
```

## Version Information

- **Version**: See `version.txt`
- **Commit**: See `commit.txt`


