'use strict';

/**
 * Sri Lanka Sustainable Energy Authority (SLSEA) - Solar Generation Tracking Platform
 * Production Database Seeding Script (Node.js / Sequelize)
 *
 * Scale requirements:
 * - 9 Provinces
 * - 25 Districts
 * - 28 Grid Substations (>= 20)
 * - 200 Solar Installations (>= 200, unique meter_id)
 * - 1 Week of 15-minute interval telemetry per site (672 readings/site = 134,400 readings)
 * - Diurnal curve: 0 kW between 18:30 and 05:30, peak between 11:30 and 13:30
 * - Realistic cumulative energy_kwh tracking
 */

const { v4: uuidv4 } = require('uuid');
const {
  sequelize,
  Province,
  District,
  GridSubstation,
  SolarInstallation,
  GenerationReading,
  User,
} = require('../models');

// ------------------------------------------------------------------------------
// 1. Static Geographical & Infrastructure Topology of Sri Lanka
// ------------------------------------------------------------------------------

const PROVINCES_DATA = [
  { name: 'Western', code: 'WP' },
  { name: 'Central', code: 'CP' },
  { name: 'Southern', code: 'SP' },
  { name: 'Northern', code: 'NP' },
  { name: 'Eastern', code: 'EP' },
  { name: 'North Western', code: 'NWP' },
  { name: 'North Central', code: 'NCP' },
  { name: 'Uva', code: 'UP' },
  { name: 'Sabaragamuwa', code: 'SAB' },
];

const DISTRICTS_MAP = {
  WP: ['Colombo', 'Gampaha', 'Kalutara'],
  CP: ['Kandy', 'Matale', 'Nuwara Eliya'],
  SP: ['Galle', 'Matara', 'Hambantota'],
  NP: ['Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu'],
  EP: ['Batticaloa', 'Ampara', 'Trincomalee'],
  NWP: ['Kurunegala', 'Puttalam'],
  NCP: ['Anuradhapura', 'Polonnaruwa'],
  UP: ['Badulla', 'Monaragala'],
  SAB: ['Ratnapura', 'Kegalle'],
};

// 28 Grid Substations across all 25 Districts (Capacities in MW)
const SUBSTATIONS_BY_DISTRICT = {
  Colombo: [
    { name: 'Pannipitiya GSS', capacity_mw: 250.0 },
    { name: 'Kolonnawa GSS', capacity_mw: 180.0 },
  ],
  Gampaha: [
    { name: 'Biyagama GSS', capacity_mw: 300.0 },
    { name: 'Kotugoda GSS', capacity_mw: 220.0 },
  ],
  Kalutara: [{ name: 'Horana GSS', capacity_mw: 120.0 }],
  Kandy: [{ name: 'Kiribathkumbura GSS', capacity_mw: 150.0 }],
  Matale: [{ name: 'Naula GSS', capacity_mw: 80.0 }],
  'Nuwara Eliya': [{ name: 'Kotmale GSS', capacity_mw: 200.0 }],
  Galle: [{ name: 'Galle GSS', capacity_mw: 120.0 }],
  Matara: [{ name: 'Matara GSS', capacity_mw: 100.0 }],
  Hambantota: [{ name: 'Hambantota GSS', capacity_mw: 220.0 }],
  Jaffna: [{ name: 'Chunnakam GSS', capacity_mw: 100.0 }],
  Kilinochchi: [{ name: 'Kilinochchi GSS', capacity_mw: 60.0 }],
  Mannar: [{ name: 'Mannar GSS', capacity_mw: 150.0 }],
  Vavuniya: [{ name: 'Vavuniya GSS', capacity_mw: 80.0 }],
  Mullaitivu: [{ name: 'Mullaitivu GSS', capacity_mw: 50.0 }],
  Batticaloa: [{ name: 'Valachchenai GSS', capacity_mw: 80.0 }],
  Ampara: [{ name: 'Ampara GSS', capacity_mw: 90.0 }],
  Trincomalee: [{ name: 'Trincomalee GSS', capacity_mw: 160.0 }],
  Kurunegala: [{ name: 'Kurunegala GSS', capacity_mw: 140.0 }],
  Puttalam: [{ name: 'Madampe GSS', capacity_mw: 120.0 }, { name: 'Puttalam GSS', capacity_mw: 180.0 }],
  Anuradhapura: [{ name: 'Anuradhapura GSS', capacity_mw: 150.0 }],
  Polonnaruwa: [{ name: 'Polonnaruwa GSS', capacity_mw: 90.0 }],
  Badulla: [{ name: 'Badulla GSS', capacity_mw: 110.0 }],
  Monaragala: [{ name: 'Monaragala GSS', capacity_mw: 100.0 }],
  Ratnapura: [{ name: 'Ratnapura GSS', capacity_mw: 100.0 }],
  Kegalle: [{ name: 'Thulhiriya GSS', capacity_mw: 120.0 }],
};

const INSTALLATION_TYPES = ['rooftop', 'ground_mounted', 'floating', 'agrivoltaic'];

// ------------------------------------------------------------------------------
// 2. Diurnal Solar Curve Model for Sri Lanka (Latitude ~6-9°N)
// ------------------------------------------------------------------------------

/**
 * Calculates instantaneous solar power (kW) based on Sri Lankan equatorial solar profile.
 * - 0 kW between 18:30 and 05:30 (nighttime).
 * - Ramp up from 05:30 to 11:30.
 * - Peak generation window between 11:30 and 13:30 (75% to 85% rated capacity).
 * - Ramp down from 13:30 to 18:30.
 * - Includes realistic cloud variance and atmospheric diffusion.
 *
 * @param {number} hourOfDay - Decimal hour (0.0 to 23.75)
 * @param {number} capacityKw - Rated capacity in kWp
 * @param {number} dayIndex - Day index (0-6) for pseudo-weather consistency
 * @returns {number} Active power generation in kW
 */
function calculateDiurnalPower(hourOfDay, capacityKw, dayIndex) {
  const sunriseHour = 5.5; // 05:30
  const sunsetHour = 18.5; // 18:30

  // 1. Strict nighttime rule: 0 kW output between 18:30 and 05:30
  if (hourOfDay < sunriseHour || hourOfDay >= sunsetHour) {
    return 0.0;
  }

  // 2. Normalize daylight time to [0, 1]
  const daylightDuration = sunsetHour - sunriseHour; // 13.0 hours
  const t = (hourOfDay - sunriseHour) / daylightDuration;

  // 3. Half-sine wave base curve (peaks at t = 0.538, i.e., 12:30 solar noon)
  let solarIntensity = Math.sin(Math.PI * t);
  if (solarIntensity < 0) solarIntensity = 0;

  // Flatten peak between 11:30 and 13:30 (approx t between 0.46 and 0.61)
  if (hourOfDay >= 11.5 && hourOfDay <= 13.5) {
    solarIntensity = Math.pow(solarIntensity, 0.85); // Gentle flattening around peak
  }

  // 4. Typical tropical derating factor (ambient temperature, DC-to-AC losses, dust): 78% - 84%
  const basePeakFactor = 0.82;

  // 5. Realistic micro-meteorological noise (cloud passage +/- 5%)
  const weatherVariation = 1.0 + (Math.sin(hourOfDay * 4.5 + dayIndex * 1.7) * 0.06);

  let output = capacityKw * basePeakFactor * solarIntensity * weatherVariation;

  // Never exceed 90% inverter clipping or fall below 0
  output = Math.max(0.0, Math.min(output, capacityKw * 0.90));

  // Round to 3 decimal places
  return Math.round(output * 1000) / 1000;
}

/**
 * Generates realistic AC grid voltage (nominal 230V with daytime solar backfeed rise).
 * @param {number} powerRatio - ratio of current power to capacity
 * @returns {number} Voltage in Volts (e.g. 227.50 to 236.80)
 */
function calculateGridVoltage(powerRatio) {
  // Nominal 230V +/- 3%, slight voltage rise during high solar backfeed
  const baseVoltage = 228.0;
  const solarRise = powerRatio * 4.5;
  const gridNoise = (Math.random() - 0.5) * 2.0;
  const voltage = baseVoltage + solarRise + gridNoise;
  return Math.round(voltage * 100) / 100;
}

// ------------------------------------------------------------------------------
// 3. Main Seeder Execution
// ------------------------------------------------------------------------------

async function seedDatabase() {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('⚡ SLSEA Solar Tracking Platform - Starting Database Seeder');
  console.log('================================================================');

  try {
    await sequelize.authenticate();
    console.log('✔ Connected to PostgreSQL database successfully.');

    // --------------------------------------------------------------------------
    // A. Seed Provinces (9)
    // --------------------------------------------------------------------------
    console.log('\n[1/5] Seeding 9 Administrative Provinces...');
    const provincesMap = new Map(); // code -> Province instance
    for (const p of PROVINCES_DATA) {
      const [province] = await Province.findOrCreate({
        where: { code: p.code },
        defaults: {
          name: p.name,
          code: p.code,
        },
      });
      provincesMap.set(p.code, province);
    }
    console.log(`✔ 9 Provinces ready.`);

    // --------------------------------------------------------------------------
    // B. Seed Districts (25)
    // --------------------------------------------------------------------------
    console.log('\n[2/5] Seeding 25 Districts correctly mapped to Provinces...');
    const districtsMap = new Map(); // name -> District instance
    let districtCount = 0;

    for (const [provCode, districtNames] of Object.entries(DISTRICTS_MAP)) {
      const province = provincesMap.get(provCode);
      for (const name of districtNames) {
        const [district] = await District.findOrCreate({
          where: { province_id: province.id, name },
          defaults: {
            name,
            province_id: province.id,
          },
        });
        districtsMap.set(name, district);
        districtCount++;
      }
    }
    console.log(`✔ ${districtCount} Districts mapped and ready.`);

    // --------------------------------------------------------------------------
    // C. Seed Grid Substations (28 substations, requirement >= 20)
    // --------------------------------------------------------------------------
    console.log('\n[3/5] Seeding Grid Substations across districts (>= 20)...');
    const substationsList = [];

    for (const [districtName, substations] of Object.entries(SUBSTATIONS_BY_DISTRICT)) {
      const district = districtsMap.get(districtName);
      for (const sub of substations) {
        const [substation] = await GridSubstation.findOrCreate({
          where: { name: sub.name, district_id: district.id },
          defaults: {
            name: sub.name,
            capacity_mw: sub.capacity_mw,
            district_id: district.id,
          },
        });
        substationsList.push(substation);
      }
    }
    console.log(`✔ ${substationsList.length} Grid Substations ready.`);

    // --------------------------------------------------------------------------
    // D. Seed Solar Installations (200 sites, requirement >= 200)
    // --------------------------------------------------------------------------
    console.log('\n[4/5] Seeding 200 Solar Installations distributed across GSS...');
    const TARGET_INSTALLATION_COUNT = 200;
    const installationsList = [];

    // Capacity archetypes in kW:
    // Commercial Rooftop (50 - 250 kW)
    // Industrial / Agri (500 - 1500 kW)
    // Utility-scale Solar Park (2000 - 5000 kW)
    const capacities = [25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0];

    for (let i = 1; i <= TARGET_INSTALLATION_COUNT; i++) {
      const meterId = `SLSEA-MTR-${String(i).padStart(4, '0')}`;
      const gss = substationsList[(i - 1) % substationsList.length];
      const installType = INSTALLATION_TYPES[i % INSTALLATION_TYPES.length];
      const capacity = capacities[i % capacities.length];
      const siteName = `${gss.name.replace(' GSS', '')} Solar Unit #${String(i).padStart(3, '0')}`;

      const [installation] = await SolarInstallation.findOrCreate({
        where: { meter_id: meterId },
        defaults: {
          name: siteName,
          capacity_kw: capacity,
          installation_type: installType,
          grid_substation_id: gss.id,
          meter_id: meterId,
        },
      });
      installationsList.push(installation);
    }
    console.log(`✔ ${installationsList.length} Solar Installations verified.`);

    // --------------------------------------------------------------------------
    // E. Seed GenerationReadings (1 Week @ 15-min intervals = 672 readings/site)
    // --------------------------------------------------------------------------
    console.log('\n[5/5] Generating 1-Week of 15-minute telemetry per site...');
    console.log('   Scale: 200 sites * 7 days * 96 readings/day = 134,400 total readings');

    // Time window: Past 7 days up to yesterday 23:45
    const now = new Date();
    const endDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const startDay = new Date(endDay.getTime() - (7 * 24 * 60 * 60 * 1000));

    console.log(`   Time Window: ${startDay.toISOString()} -> ${endDay.toISOString()}`);

    // Check if readings already exist to avoid duplicate re-run work
    const existingReadingsCount = await GenerationReading.count();
    if (existingReadingsCount >= TARGET_INSTALLATION_COUNT * 672) {
      console.log(`   Telemetry data already present (${existingReadingsCount} records). Skipping generation.`);
    } else {
      // Chunked ingestion to prevent memory exhaustion and database statement timeouts
      const BATCH_SIZE = 8000;
      let buffer = [];
      let totalInserted = 0;

      for (let siteIndex = 0; siteIndex < installationsList.length; siteIndex++) {
        const site = installationsList[siteIndex];
        const capacityKw = parseFloat(site.capacity_kw);

        // Initial cumulative energy baseline (e.g. 5,000 to 25,000 kWh based on capacity)
        let cumulativeEnergyKwh = capacityKw * 25.0;

        // Iterate through 7 days
        for (let day = 0; day < 7; day++) {
          const currentDayStart = new Date(startDay.getTime() + (day * 24 * 60 * 60 * 1000));

          // 96 readings per 24 hours (15-minute steps)
          for (let step = 0; step < 96; step++) {
            const minutesOffset = step * 15;
            const readingTime = new Date(currentDayStart.getTime() + (minutesOffset * 60 * 1000));

            // Decimal hour (0.0 to 23.75)
            const hourOfDay = readingTime.getUTCHours() + (readingTime.getUTCMinutes() / 60.0);

            // 1. Calculate realistic diurnal power
            const powerKw = calculateDiurnalPower(hourOfDay, capacityKw, day);

            // 2. Accumulate energy: Delta kWh = Power (kW) * 0.25 hours (15 minutes)
            const deltaKwh = (powerKw * 0.25);
            cumulativeEnergyKwh += deltaKwh;

            // 3. Grid voltage
            const voltageV = calculateGridVoltage(capacityKw > 0 ? powerKw / capacityKw : 0);

            buffer.push({
              installation_id: site.id,
              timestamp: readingTime,
              power_kw: powerKw,
              energy_kwh: Math.round(cumulativeEnergyKwh * 10000) / 10000,
              voltage_v: voltageV,
            });

            // Flush buffer when batch size is reached
            if (buffer.length >= BATCH_SIZE) {
              await GenerationReading.bulkCreate(buffer, {
                ignoreDuplicates: true,
                validate: false,
                logging: false,
              });
              totalInserted += buffer.length;
              process.stdout.write(`   Progress: Inserted ${totalInserted} / 134,400 readings...\r`);
              buffer = [];
            }
          }
        }
      }

      // Flush remaining records in buffer
      if (buffer.length > 0) {
        await GenerationReading.bulkCreate(buffer, {
          ignoreDuplicates: true,
          validate: false,
          logging: false,
        });
        totalInserted += buffer.length;
      }
      console.log(`\n✔ Telemetry ingestion complete: ${totalInserted} total readings inserted.`);
    }

    // --------------------------------------------------------------------------
    // F. Seed Default System Users (Optional administrative accounts)
    // --------------------------------------------------------------------------
    console.log('\n[Bonus] Seeding default jurisdictional users...');
    const westernProv = provincesMap.get('WP');
    const colomboDist = districtsMap.get('Colombo');

    const defaultUsers = [
      {
        email: 'national.admin@slsea.gov.lk',
        password_hash: '$2b$12$KIXp4lqM5mHq0dYV8lW1eu1Y6YQvF8GZf1jK7kLzE/mR5uG9g5r6e', // Bcrypt placeholder
        role: 'national',
        jurisdiction_id: null,
      },
      {
        email: 'western.provincial@slsea.gov.lk',
        password_hash: '$2b$12$KIXp4lqM5mHq0dYV8lW1eu1Y6YQvF8GZf1jK7kLzE/mR5uG9g5r6e',
        role: 'provincial',
        jurisdiction_id: westernProv.id,
      },
      {
        email: 'colombo.district@slsea.gov.lk',
        password_hash: '$2b$12$KIXp4lqM5mHq0dYV8lW1eu1Y6YQvF8GZf1jK7kLzE/mR5uG9g5r6e',
        role: 'district',
        jurisdiction_id: colomboDist.id,
      },
    ];

    for (const u of defaultUsers) {
      await User.findOrCreate({
        where: { email: u.email },
        defaults: u,
      });
    }
    console.log('✔ Default administrative users verified.');

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n================================================================');
    console.log(`🎉 Seeding Successfully Completed in ${totalSeconds}s!`);
    console.log('================================================================');
  } catch (error) {
    console.error('❌ Seeding failed with error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run script if invoked directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
