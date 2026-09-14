const { DataTypes, Model } = require('sequelize');

class GridSubstation extends Model {
  static initModel(sequelize) {
    return GridSubstation.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(150),
          allowNull: false,
          comment: 'Grid Substation Name (e.g., Pannipitiya GSS, Kotmale GSS)',
        },
        capacity_mw: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          validate: {
            min: {
              args: [0.01],
              msg: 'capacity_mw must be strictly positive',
            },
          },
          comment: 'Substation transformer capacity in Megawatts (MW)',
        },
        district_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'districts',
            key: 'id',
          },
          onDelete: 'RESTRICT',
          comment: 'District where this GSS is geographically sited',
        },
      },
      {
        sequelize,
        tableName: 'grid_substations',
        timestamps: true,
        underscored: true,
        indexes: [
          { fields: ['district_id'] },
          { fields: ['name'] },
        ],
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.District, {
      foreignKey: {
        name: 'district_id',
        allowNull: false,
      },
      as: 'district',
    });

    this.hasMany(models.SolarInstallation, {
      foreignKey: {
        name: 'grid_substation_id',
        allowNull: false,
      },
      as: 'solar_installations',
      onDelete: 'RESTRICT',
    });
  }
}

module.exports = GridSubstation;
