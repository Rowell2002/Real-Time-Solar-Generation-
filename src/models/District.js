const { DataTypes, Model } = require('sequelize');

class District extends Model {
  static initModel(sequelize) {
    return District.init(
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
          comment: 'District name (e.g., Colombo, Gampaha, Kandy)',
        },
        province_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'provinces',
            key: 'id',
          },
          onDelete: 'RESTRICT',
          comment: 'Foreign key referencing Province',
        },
      },
      {
        sequelize,
        tableName: 'districts',
        timestamps: true,
        underscored: true,
        indexes: [
          { fields: ['province_id'] },
          { fields: ['name'] },
          { unique: true, fields: ['province_id', 'name'] },
        ],
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.Province, {
      foreignKey: {
        name: 'province_id',
        allowNull: false,
      },
      as: 'province',
    });

    this.hasMany(models.GridSubstation, {
      foreignKey: {
        name: 'district_id',
        allowNull: false,
      },
      as: 'grid_substations',
      onDelete: 'RESTRICT',
    });
  }
}

module.exports = District;
