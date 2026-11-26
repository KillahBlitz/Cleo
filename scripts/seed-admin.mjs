import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || process.env.NUXT_MONGODB_URI;
const username = process.env.NUXT_ADMIN_USERNAME;
const passwordHash = process.env.NUXT_ADMIN_PASSWORD_HASH;
if (!uri || !username || !passwordHash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) {
  console.error('Configura MONGODB_URI, NUXT_ADMIN_USERNAME y un NUXT_ADMIN_PASSWORD_HASH scrypt válido.');
  process.exit(1);
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const admins = client.db('cleo_db').collection('admin');
  await admins.createIndex({ username: 1 }, { unique: true });
  const result = await admins.updateOne(
    { username },
    { $setOnInsert: { username, passwordHash, passwordAlgorithm: 'scrypt', createdAt: new Date(), updatedAt: new Date() } },
    { upsert: true },
  );
  const saved = await admins.findOne({ username });
  if (!saved || saved.passwordHash !== passwordHash || saved.passwordAlgorithm !== 'scrypt') {
    throw new Error('ExistingAdminMismatch');
  }
  console.log(JSON.stringify({ database: 'cleo_db', collection: 'admin', username, created: result.upsertedCount === 1, verified: true }));
} catch (error) {
  // No mostrar mensajes del driver: pueden contener datos de conexión.
  console.error(error.message === 'ExistingAdminMismatch'
    ? 'El administrador existente tiene credenciales diferentes; no se modificó su contraseña.'
    : `No se pudo guardar/verificar el administrador (${error.name}).`);
  process.exitCode = 1;
} finally {
  await client.close();
}
