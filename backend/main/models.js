// Sequelize models for the Event Booking System. No associations -- FK columns only, joins are explicit in queries.
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class User extends Model {}
  User.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    location: { type: DataTypes.STRING(120) },
    address: { type: DataTypes.TEXT },
    username: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    mobile: { type: DataTypes.STRING(20) },
    hashedPassword: { type: DataTypes.STRING(255), allowNull: false, field: 'hashed_password' },
  }, { sequelize, modelName: 'User', tableName: 'user', underscored: true, timestamps: true });

  class Event extends Model {}
  Event.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(6), allowNull: false, unique: true }, // shareable slug
    name: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT },
    artists: { type: DataTypes.TEXT }, // comma-separated for MVP
    dateTime: { type: DataTypes.DATE, allowNull: false, field: 'date_time' },
    venue: { type: DataTypes.STRING(200), allowNull: false },
    location: { type: DataTypes.STRING(120), allowNull: false },
    totalSeats: { type: DataTypes.INTEGER, allowNull: false, field: 'total_seats' },
    availableSeats: { type: DataTypes.INTEGER, allowNull: false, field: 'available_seats' }, // eventually-consistent cache; Redis is source of truth
    bannerurl: { type: DataTypes.STRING(500) },
    thumbnailurl: { type: DataTypes.STRING(500) },
    model: { type: DataTypes.ENUM('general', 'seat_map'), allowNull: false, defaultValue: 'general' },
  }, {
    sequelize, modelName: 'Event', tableName: 'events', underscored: true, timestamps: true,
    indexes: [{ fields: ['location', 'date_time'] }],
  });

  class Booking extends Model {}
  Booking.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'user_id',
      references: { model: 'user', key: 'id' }, onDelete: 'CASCADE', // FK only, no association
    },
    eventId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'event_id',
      references: { model: 'events', key: 'id' }, onDelete: 'CASCADE', // FK only, no association
    },
    numSeats: { type: DataTypes.INTEGER, allowNull: false, field: 'num_seats' }, // general: count; seat_map: len(seats_booked)
    status: { type: DataTypes.ENUM('confirmed', 'cancelled'), allowNull: false, defaultValue: 'confirmed' },
    amount: { type: DataTypes.DECIMAL(10, 2) }, // fake gateway, no real charge
    paymentRef: { type: DataTypes.STRING(80), field: 'payment_ref' },
  }, {
    sequelize, modelName: 'Booking', tableName: 'bookings', underscored: true, timestamps: true,
    indexes: [{ fields: ['user_id', 'event_id'] }],
  });

  class SeatBooked extends Model {}
  SeatBooked.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    bookingId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'booking_id',
      references: { model: 'bookings', key: 'id' }, onDelete: 'CASCADE', // FK only, no association
    },
    eventId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'event_id', // denormalized for fast lookups
      references: { model: 'events', key: 'id' }, onDelete: 'CASCADE',
    },
    seatNum: { type: DataTypes.INTEGER, allowNull: false, field: 'seat_num' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    cancelled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    sequelize, modelName: 'SeatBooked', tableName: 'seats_booked', underscored: true, timestamps: false,
    indexes: [{ fields: ['event_id', 'seat_num'] }], // no unique constraint -- Redis guards double-booking
  });

  return { User, Event, Booking, SeatBooked };
};