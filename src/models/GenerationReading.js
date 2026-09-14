const { DataTypes, Model } = require('sequelize');

class GenerationReading extends Model {
  static initModel(sequelize) {
    return GenerationReading.init(
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: 'Monotonically increasing 64-bit sequence identifier',
        },
        installation_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'solar_installations',
            key: 'id',
          },
          onDelete: 'CASCADE',
          comment: 'Associated Solar Installation',
        },
        timestamp: {
          type: DataTypes.DATE, // Maps to TIMESTAMPTZ in PostgreSQL
          allowNull: false,
          comment: 'Reading timestamp recorded by meter (UTC)',
        },
        power_kw: {
          type: DataTypes.DECIMAL(12, 3),
          allowNull: false,
          validate: {
            min: {
              args: [0],
              msg: 'power_kw must be non-negative',
            },
          },
          comment: 'Active instantaneous power in kW',
        },
        energy_kwh: {
          type: DataTypes.DECIMAL(16, 4),
          allowNull: false,
          validate: {
            min: {
              args: [0],
              msg: 'energy_kwh must be non-negative',
            },
          },
          comment: 'Cumulative generated active energy in kWh',
        },
        voltage_v: {
          type: DataTypes.DECIMAL(8, 2),
          allowNull: false,
          validate: {
            min: {
              args: [0],
              msg: 'voltage_v must be non-negative',
            },
          },
          comment: 'AC grid voltage in Volts (V)',
        },
      },
      {
        sequelize,
        tableName: 'generation_readings',
        // Pure append-only ledger: No updatedAt column, only creation timestamp or the meter timestamp
        timestamps: false,
        underscored: true,
        indexes: [
          // Index on foreign key
          { fields: ['installation_id'] },
          // Index on timestamp
          { fields: ['timestamp'] },
          // High-throughput composite index for time-series range queries and latest reading retrieval
          {
            name: 'ix_generation_readings_inst_time_desc',
            fields: [
              'installation_id',
              { attribute: 'timestamp', order: 'DESC' },
            ],
          },
          // Deduplication protection: exactly one reading per installation per meter timestamp
          {
            unique: true,
            name: 'uq_generation_readings_inst_timestamp',
            fields: ['installation_id', 'timestamp'],
          },
        ],
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.SolarInstallation, {
      foreignKey: {
        name: 'installation_id',
        allowNull: false,
      },
      as: 'installation',
    });
  }
}

module.exports = GenerationReading;
