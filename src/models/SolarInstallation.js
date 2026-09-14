const { DataTypes, Model } = require('sequelize');

class SolarInstallation extends Model {
  static initModel(sequelize) {
    return SolarInstallation.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(200),
          allowNull: false,
          comment: 'Solar installation site name',
        },
        capacity_kw: {
          type: DataTypes.DECIMAL(12, 3),
          allowNull: false,
          validate: {
            min: {
              args: [0.001],
              msg: 'capacity_kw must be positive',
            },
          },
          comment: 'Installed peak capacity in Kilowatts (kWp)',
        },
        installation_type: {
          type: DataTypes.ENUM('rooftop', 'ground_mounted', 'floating', 'agrivoltaic'),
          allowNull: false,
          defaultValue: 'rooftop',
          comment: 'Installation category',
        },
        grid_substation_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'grid_substations',
            key: 'id',
          },
          onDelete: 'RESTRICT',
          comment: 'Interconnected Grid Substation ID',
        },
        // CRITICAL REQUIREMENT: meter_id is a direct attribute. No separate Device entity.
        meter_id: {
          type: DataTypes.STRING(100),
          allowNull: false,
          unique: true,
          comment: 'Direct smart meter serial/hardware identifier (No separate Device table)',
        },
      },
      {
        sequelize,
        tableName: 'solar_installations',
        timestamps: true,
        underscored: true,
        indexes: [
          { unique: true, fields: ['meter_id'] },
          { fields: ['grid_substation_id'] },
          { fields: ['installation_type'] },
          { fields: ['name'] },
        ],
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.GridSubstation, {
      foreignKey: {
        name: 'grid_substation_id',
        allowNull: false,
      },
      as: 'grid_substation',
    });

    // Readings relationship. NOTE: No last_reading columns are stored on this model.
    this.hasMany(models.GenerationReading, {
      foreignKey: {
        name: 'installation_id',
        allowNull: false,
      },
      as: 'readings',
      onDelete: 'CASCADE',
    });
  }
}

module.exports = SolarInstallation;
