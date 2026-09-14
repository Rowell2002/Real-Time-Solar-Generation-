'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Enable pgcrypto extension for UUID generation
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    // 2. Create 'provinces' table
    await queryInterface.createTable('provinces', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      code: {
        type: Sequelize.STRING(10),
        allowNull: false,
        unique: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('provinces', ['name'], { name: 'ix_provinces_name' });
    await queryInterface.addIndex('provinces', ['code'], { name: 'ix_provinces_code' });

    // 3. Create 'districts' table
    await queryInterface.createTable('districts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      province_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'provinces',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('districts', ['province_id'], { name: 'ix_districts_province_id' });
    await queryInterface.addIndex('districts', ['name'], { name: 'ix_districts_name' });
    await queryInterface.addIndex('districts', ['province_id', 'name'], {
      unique: true,
      name: 'uq_districts_province_name',
    });

    // 4. Create 'grid_substations' table
    await queryInterface.createTable('grid_substations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      capacity_mw: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      district_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'districts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('grid_substations', ['district_id'], { name: 'ix_grid_substations_district_id' });
    await queryInterface.addIndex('grid_substations', ['name'], { name: 'ix_grid_substations_name' });

    // 5. Create 'solar_installations' table (Direct meter_id attribute, NO Device entity)
    await queryInterface.createTable('solar_installations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      capacity_kw: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
      },
      installation_type: {
        type: Sequelize.ENUM('rooftop', 'ground_mounted', 'floating', 'agrivoltaic'),
        allowNull: false,
        defaultValue: 'rooftop',
      },
      grid_substation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'grid_substations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      meter_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('solar_installations', ['meter_id'], {
      unique: true,
      name: 'ix_solar_installations_meter_id',
    });
    await queryInterface.addIndex('solar_installations', ['grid_substation_id'], {
      name: 'ix_solar_installations_substation_id',
    });
    await queryInterface.addIndex('solar_installations', ['installation_type'], {
      name: 'ix_solar_installations_type',
    });

    // 6. Create 'generation_readings' table (Append-only time-series ledger)
    await queryInterface.createTable('generation_readings', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      installation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'solar_installations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      power_kw: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
      },
      energy_kwh: {
        type: Sequelize.DECIMAL(16, 4),
        allowNull: false,
      },
      voltage_v: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: false,
      },
    });
    await queryInterface.addIndex('generation_readings', ['installation_id'], {
      name: 'ix_generation_readings_installation_id',
    });
    await queryInterface.addIndex('generation_readings', ['timestamp'], {
      name: 'ix_generation_readings_timestamp',
    });
    // High-throughput composite index for time-series range slicing and latest reading lookups:
    await queryInterface.addIndex('generation_readings', ['installation_id', 'timestamp'], {
      name: 'ix_generation_readings_inst_time_desc',
      order: [['timestamp', 'DESC']],
    });
    await queryInterface.addIndex('generation_readings', ['installation_id', 'timestamp'], {
      unique: true,
      name: 'uq_generation_readings_inst_timestamp',
    });

    // 7. Create 'users' table
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      role: {
        type: Sequelize.ENUM('national', 'provincial', 'district'),
        allowNull: false,
      },
      jurisdiction_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('users', ['email'], { unique: true, name: 'ix_users_email' });
    await queryInterface.addIndex('users', ['role'], { name: 'ix_users_role' });
    await queryInterface.addIndex('users', ['role', 'jurisdiction_id'], {
      name: 'ix_users_role_jurisdiction',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('generation_readings');
    await queryInterface.dropTable('solar_installations');
    await queryInterface.dropTable('grid_substations');
    await queryInterface.dropTable('districts');
    await queryInterface.dropTable('provinces');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_solar_installations_installation_type";');
  },
};
