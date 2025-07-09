#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Leer el archivo package.json
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Extraer el nombre del paquete
const packageName = packageJson.name;

async function runCommand(command) {
  console.log(`⚙️ Ejecutando: ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { success: false, error };
  }
}

async function clean() {
  console.log('\n🧹 Limpiando directorios de salida...');
  try {
    // Eliminar el directorio dist si existe
    if (fs.existsSync('./dist')) {
      fs.rmSync('./dist', { recursive: true, force: true });
    }
    console.log('✅ Limpieza completada');
    return { success: true };
  } catch (error) {
    console.error(`❌ Error durante la limpieza: ${error.message}`);
    return { success: false, error };
  }
}

async function buildProject() {
  console.log('\n🔨 Construyendo proyecto...');
  return await runCommand('tsc');
}

async function build() {
  console.log(`\n� Iniciando construcción de ${packageName}...\n`);
  
  const cleanResult = await clean();
  if (!cleanResult.success) return;
  
  const buildResult = await buildProject();
  if (!buildResult.success) return;
  
  console.log('\n✅ Construcción completada exitosamente!');
}

// Ejecutar build
build().catch(err => {
  console.error('❌ Error de construcción:', err);
  process.exit(1);
});

async function build() {
  console.log(`\n🚀 Iniciando construcción de ${packageName}...\n`);
  
  const cleanResult = await clean();
  if (!cleanResult.success) return;
  
  const esmResult = await buildEsm();
  if (!esmResult.success) return;
  
  const cjsResult = await buildCjs();
  if (!cjsResult.success) return;
  
  const typesResult = await buildTypes();
  if (!typesResult.success) return;
  
  const packageResult = await copyPackageJson();
  if (!packageResult.success) return;
  
  console.log(`\n✅ Construcción de ${packageName} completada con éxito!`);
  console.log('📦 Archivos generados en el directorio ./dist');
}

// Ejecutar el proceso de construcción
build().catch(error => {
  console.error(`❌ Error fatal durante la construcción: ${error.message}`);
  process.exit(1);
});
