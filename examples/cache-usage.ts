import { CyberMySQLOpenAI } from '../src';

/**
 * Ejemplo básico de uso con sistema de cache
 */
async function exampleWithCache() {
  console.log('🚀 Ejemplo: CyberMySQLOpenAI con sistema de cache\n');

  // Configuración con cache habilitado
  const translator = new CyberMySQLOpenAI({
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'username',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'testdb',
      ssl: false
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || 'your-api-key',
      model: 'gpt-4'
    },
    language: 'es',
    cache: {
      enabled: true,      // Cache habilitado
      maxSize: 100,       // Máximo 100 entradas
      cleanupIntervalMs: 300000 // Limpiar cada 5 minutos
    },
    logLevel: 'info'
  });

  try {
    console.log('📊 Estadísticas iniciales del cache:');
    console.log(translator.getCacheStats());
    console.log('');

    // Primera consulta - debería ir a OpenAI + MySQL
    console.log('🔍 Primera consulta (cache MISS esperado)...');
    const start1 = Date.now();
    const result1 = await translator.query('¿Cuántos productos tenemos en total?');
    const time1 = Date.now() - start1;
    
    console.log(`⏱️  Tiempo de ejecución: ${time1}ms`);
    console.log(`🗃️  Desde cache: ${result1.fromCache ? 'SÍ' : 'NO'}`);
    console.log(`📄 SQL generado: ${result1.sql}`);
    console.log(`📝 Respuesta: ${result1.naturalResponse}`);
    console.log('');

    // Segunda consulta idéntica - debería venir del cache
    console.log('🔍 Segunda consulta idéntica (cache HIT esperado)...');
    const start2 = Date.now();
    const result2 = await translator.query('¿Cuántos productos tenemos en total?');
    const time2 = Date.now() - start2;
    
    console.log(`⏱️  Tiempo de ejecución: ${time2}ms`);
    console.log(`🗃️  Desde cache: ${result2.fromCache ? 'SÍ' : 'NO'}`);
    console.log(`📄 SQL: ${result2.sql}`);
    console.log(`📝 Respuesta: ${result2.naturalResponse}`);
    console.log(`🚀 Mejora de rendimiento: ${Math.round(((time1 - time2) / time1) * 100)}%`);
    console.log('');

    // Tercera consulta similar pero ligeramente diferente
    console.log('🔍 Tercera consulta similar...');
    const start3 = Date.now();
    const result3 = await translator.query('¿Cuántos productos hay en total?');
    const time3 = Date.now() - start3;
    
    console.log(`⏱️  Tiempo de ejecución: ${time3}ms`);
    console.log(`🗃️  Desde cache: ${result3.fromCache ? 'SÍ' : 'NO'}`);
    console.log(`📄 SQL: ${result3.sql}`);
    console.log('');

    // Estadísticas finales del cache
    console.log('📊 Estadísticas finales del cache:');
    const finalStats = translator.getCacheStats();
    if (finalStats) {
      console.log(`  📦 Total entradas: ${finalStats.totalEntries}`);
      console.log(`  ✅ Cache hits: ${finalStats.hits}`);
      console.log(`  ❌ Cache misses: ${finalStats.misses}`);
      console.log(`  📈 Hit rate: ${finalStats.hitRate.toFixed(1)}%`);
      console.log(`  🧠 Uso de memoria: ${(finalStats.memoryUsage / 1024).toFixed(1)} KB`);
    }
    console.log('');

    // Demostrando invalidación de cache
    console.log('🗑️  Limpiando cache...');
    translator.clearCache();
    console.log('Cache limpiado. Estadísticas:');
    console.log(translator.getCacheStats());
    console.log('');

    // Demostrando deshabilitación dinámica del cache
    console.log('⚠️  Deshabilitando cache dinámicamente...');
    translator.setCacheEnabled(false);
    
    const start4 = Date.now();
    const result4 = await translator.query('¿Cuántos productos tenemos en total?');
    const time4 = Date.now() - start4;
    
    console.log(`⏱️  Tiempo sin cache: ${time4}ms`);
    console.log(`🗃️  Desde cache: ${result4.fromCache ? 'SÍ' : 'NO'}`);
    console.log('');

    // Rehabilitar cache
    console.log('✅ Rehabilitando cache...');
    translator.setCacheEnabled(true);
    console.log(`Cache enabled: ${translator.isCacheEnabled()}`);

  } catch (error) {
    console.error('❌ Error en el ejemplo:', error);
  } finally {
    // Cerrar conexiones
    await translator.close();
  }
}

/**
 * Ejemplo de uso en un escenario de API
 */
async function apiScenarioExample() {
  console.log('\n🌐 Ejemplo: Escenario de API con cache compartido\n');

  // Simular múltiples requests de API
  const translator = new CyberMySQLOpenAI({
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'username',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'testdb'
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || 'your-api-key',
      model: 'gpt-4'
    },
    cache: {
      enabled: true,
      maxSize: 50
    },
    logLevel: 'warn' // Solo warnings y errores
  });

  // Simular requests típicos de un dashboard
  const commonQueries = [
    'Show me total users',
    'What are today\'s sales?',
    'How many orders are pending?',
    'List top 5 products',
    'Show me total users' // Repetida intencionalmente
  ];

  console.log('📡 Simulando requests de API dashboard...');
  
  for (let i = 0; i < commonQueries.length; i++) {
    const query = commonQueries[i];
    const start = Date.now();
    
    try {
      const result = await translator.query(query);
      const time = Date.now() - start;
      
      console.log(`Request ${i + 1}: "${query}"`);
      console.log(`  ⏱️  ${time}ms | Cache: ${result.fromCache ? '✅ HIT' : '❌ MISS'}`);
      
    } catch (error) {
      console.log(`Request ${i + 1}: ❌ Error - ${(error as Error).message}`);
    }
  }

  const stats = translator.getCacheStats();
  if (stats) {
    console.log('\n📊 Resultados del escenario API:');
    console.log(`  📈 Hit rate: ${stats.hitRate.toFixed(1)}%`);
    console.log(`  ⚡ Requests optimizados: ${stats.hits}/${stats.hits + stats.misses}`);
  }

  await translator.close();
}

// Ejecutar ejemplos
async function main() {
  try {
    await exampleWithCache();
    //await apiScenarioExample();
  } catch (error) {
    console.error('Error en los ejemplos:', error);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}

export { exampleWithCache, apiScenarioExample };
