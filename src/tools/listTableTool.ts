import { Tool } from '@langchain/core/tools';
import { Sequelize } from 'sequelize';

export class ListTablesTool extends Tool {
      
  name = "list-database-tables";
  description = "Useful for getting a list of all tables in the database. The input should be an empty string.";
  
  constructor(private sequelize: Sequelize) {
    super();
  }
  
  protected async _call(_input: string): Promise<string> {
    try {
      const tables = await this.sequelize.getQueryInterface().showAllTables();
      
      if (tables.length === 0) {
        return "No tables found in the database.";
      }
      
      return `The database contains the following tables: ${tables.join(", ")}`;
    } catch (error: any) {
      return `Error listing tables: ${error.message}`;
    }
  }
}