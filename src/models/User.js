const { DataTypes, Model } = require('sequelize');

class User extends Model {
  static initModel(sequelize) {
    return User.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
          validate: {
            isEmail: true,
          },
          comment: 'User official email address',
        },
        password_hash: {
          type: DataTypes.STRING(255),
          allowNull: false,
          comment: 'Bcrypt or Argon2id hashed password',
        },
        role: {
          type: DataTypes.ENUM('national', 'provincial', 'district'),
          allowNull: false,
          comment: 'User authorization tier',
        },
        jurisdiction_id: {
          type: DataTypes.UUID,
          allowNull: true,
          comment: 'Scope ID: NULL for national; province_id or district_id otherwise',
        },
      },
      {
        sequelize,
        tableName: 'users',
        timestamps: true,
        underscored: true,
        indexes: [
          { unique: true, fields: ['email'] },
          { fields: ['role'] },
          { fields: ['role', 'jurisdiction_id'] },
        ],
        validate: {
          jurisdictionConsistency() {
            if (this.role === 'national' && this.jurisdiction_id !== null) {
              throw new Error("National role users cannot have a jurisdiction_id (must be NULL)");
            }
            if ((this.role === 'provincial' || this.role === 'district') && !this.jurisdiction_id) {
              throw new Error(`Users with role '${this.role}' must specify a jurisdiction_id`);
            }
          },
        },
      }
    );
  }

  static associate(models) {
    // Dynamic/polymorphic relation:
    // jurisdiction_id points to models.Province when role === 'provincial'
    // jurisdiction_id points to models.District when role === 'district'
    this.belongsTo(models.Province, {
      foreignKey: 'jurisdiction_id',
      constraints: false,
      as: 'provinceJurisdiction',
    });

    this.belongsTo(models.District, {
      foreignKey: 'jurisdiction_id',
      constraints: false,
      as: 'districtJurisdiction',
    });
  }
}

module.exports = User;
