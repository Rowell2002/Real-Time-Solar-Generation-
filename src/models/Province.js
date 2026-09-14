const { DataTypes, Model } = require('sequelize');

class Province extends Model {
  static initModel(sequelize) {
    return Province.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          unique: true,
          comment: 'Official province name (e.g., Western, Central)',
        },
        code: {
          type: DataTypes.STRING(10),
          allowNull: false,
          unique: true,
          comment: 'Standard province code (e.g., WP, CP, SP)',
        },
      },
      {
        sequelize,
        tableName: 'provinces',
        timestamps: true,
        underscored: true,
        indexes: [
          { unique: true, fields: ['name'] },
          { unique: true, fields: ['code'] },
        ],
      }
    );
  }

  static associate(models) {
    this.hasMany(models.District, {
      foreignKey: {
        name: 'province_id',
        allowNull: false,
      },
      as: 'districts',
      onDelete: 'RESTRICT',
    });
  }
}

module.exports = Province;
