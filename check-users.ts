import { db, users } from './src/db/index.js';

async function checkUsers() {
  try {
    const result = await db.select().from(users).limit(5);
    console.log('Users in database:', result.length);
    result.forEach(user => {
      console.log(`- Email: ${user.email}, Verified: ${user.isVerified}, ID: ${user.id}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

checkUsers();
