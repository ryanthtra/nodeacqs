import 'dotenv/config';

export default {
  schema: './src/models/*.js', // Storing the schemas here
  out: './drizzle', // Output
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  }
};