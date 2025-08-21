import { Sequelize } from 'sequelize';

export const listDatabaseTables = async (sequelize: Sequelize): Promise<string> => {
      try {
            const tables = await sequelize.getQueryInterface().showAllTables();

            if (tables.length === 0) {
                  return "No tables found in the database.";
            }

            return `The database contains the following tables: ${tables.join(", ")}`;
      } catch (error: any) {
            return `Error listing tables: ${error.message}`;
      }
};

// metadata for LangChain integration
listDatabaseTables.name = "list-database-tables";
listDatabaseTables.description = "Useful for getting a list of all tables in the database. The input should be an empty string.";