import 'dotenv/config';

// Define a type for our configuration for strong typing
interface DatabaseConfig {
  schema: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  name: string;
}

// Function to get and validate database configuration
function getDbConfig(): DatabaseConfig {
  const { DB_SCHEMA, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  // Validate that essential variables are present
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error("🔴 Missing critical database environment variables.");
    process.exit(1); // Exit the process if config is missing
  }

  const sanitizedHost = DB_HOST.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const sanitizedUser = DB_USER.replace(/,+$/g, '').trim();
  const sanitizedPass = (DB_PASSWORD || '').trim();

  // Debug logs: raw env and sanitized host (mask password)
  try {
    // eslint-disable-next-line no-console
    console.log('DB env raw:', {
      DB_HOST,
      DB_PORT,
      DB_NAME,
      DB_USER,
      DB_PASSWORD,
      DB_SCHEMA,
    });
    // eslint-disable-next-line no-console
    console.log('DB host sanitized:', sanitizedHost, 'rawCodes:', Array.from(DB_HOST).map((c) => c.charCodeAt(0)));
    console.log('DB user sanitized:', sanitizedUser, 'rawCodes:', Array.from(DB_USER).map((c) => c.charCodeAt(0)));
  } catch {}

  return {
    schema: (DB_SCHEMA || '').trim(),
    host: sanitizedHost,
    port: parseInt((DB_PORT || '5432').trim(), 10),
    user: sanitizedUser,
    pass: sanitizedPass,
    name: (DB_NAME || '').trim(),
  };
}

export const dbConfig = getDbConfig();