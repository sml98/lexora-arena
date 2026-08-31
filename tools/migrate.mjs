import { closeDatabase, runMigrations } from '../server/database.js';

if(!process.env.DATABASE_URL){
  console.error('Defina DATABASE_URL antes de executar migrations.');
  process.exitCode=1;
}else{
  try{const files=await runMigrations();console.log(`Migrations aplicadas: ${files.join(', ')}.`);}
  catch(error){console.error(`Falha na migration: ${error.message}`);process.exitCode=1;}
  finally{await closeDatabase();}
}
