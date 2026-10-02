import { DefaultNamingStrategy, Table, type NamingStrategyInterface } from 'typeorm';

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function toTableName(tableOrName: Table | string): string {
  return typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
}

function constraintSuffix(columnNames: string[]): string {
  return columnNames.map((column) => snakeCase(column)).join('_');
}

/**
 * 实体属性用 camelCase，数据库表/字段/索引统一 snake_case，
 * 迁移文件与线上表结构因此可直接由实体推导。
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  override tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ?? snakeCase(targetName);
  }

  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const name = customName ?? snakeCase(propertyName);
    return embeddedPrefixes.length > 0
      ? `${embeddedPrefixes.map((prefix) => snakeCase(prefix)).join('_')}_${name}`
      : name;
  }

  override relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  override primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return `pk_${snakeCase(toTableName(tableOrName))}_${constraintSuffix(columnNames)}`;
  }

  override uniqueConstraintName(
    tableOrName: Table | string,
    columnNames: string[],
  ): string {
    return `uk_${snakeCase(toTableName(tableOrName))}_${constraintSuffix(columnNames)}`;
  }

  override relationConstraintName(
    tableOrName: Table | string,
    columnNames: string[],
    where?: string,
  ): string {
    const base = `uniq_${snakeCase(toTableName(tableOrName))}_${constraintSuffix(columnNames)}`;
    return where === undefined ? base : `${base}_where_${snakeCase(where)}`;
  }

  override foreignKeyName(
    tableOrName: Table | string,
    columnNames: string[],
    _referencedTablePath?: string,
    _referencedColumnNames?: string[],
  ): string {
    return `fk_${snakeCase(toTableName(tableOrName))}_${constraintSuffix(columnNames)}`;
  }

  override indexName(
    tableOrName: Table | string,
    columnNames: string[],
    _where?: string,
  ): string {
    return `idx_${snakeCase(toTableName(tableOrName))}_${constraintSuffix(columnNames)}`;
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
