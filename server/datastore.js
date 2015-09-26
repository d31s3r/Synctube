/**
 * Module dependencies.
 */

var redis = require('redis-url');
var Scripto = require('redis-scripto');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
 * Datastore constructor.
 */

function Datastore () {
	EventEmitter.call(this);
};

util.inherits(Datastore, EventEmitter);

/**
 * Module exports.
 */

var datastore = module.exports = exports = new Datastore();

/**
 * Scripting client.
 */

var scripts = new Scripto(redis.connect());
scripts.loadFromDir(__dirname + '/scripts/');

/**
 * Events.
 */

var subscriber = redis.connect();
subscriber.on('ready', function () {
	subscriber.on('message', function (channel, message) {
		var obj = JSON.parse(message);
		datastore.emit('room', obj.room, obj.event, obj.args);
	});
	subscriber.subscribe(eventsChannel);
});

/**
 * Methods.
 */

Datastore.prototype.addVideo = function (room, video, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'add', getTime(), JSON.stringify(video)], wrap(cb));
};

Datastore.prototype.deleteVideo = function (room, key, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'del', getTime(), key], wrap(cb));
};

Datastore.prototype.moveVideo = function (room, key, before, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'move', getTime(), key, before], wrap(cb));
};

Datastore.prototype.playVideo = function (room, key, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'play', getTime(), key], wrap(cb));
};

Datastore.prototype.shufflePlaylist = function (room, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'shuffle', getTime()], wrap(cb));
};

Datastore.prototype.setPlaying = function (room, playing, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'setPlaying', getTime(), playing? 1 : 0], wrap(cb));
};

Datastore.prototype.setOffset = function (room, offset, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'setOffset', getTime(), offset], wrap(cb));
};

Datastore.prototype.getPlaylist = function (room, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'list', getTime()], wrap(cb));
};

Datastore.prototype.getState = function (room, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'state', getTime()], wrap(cb));
};

Datastore.prototype.deleteRoom = function (room, cb) {
	scripts.run('hashlist', getKeys(room), [eventsChannel, room, 'deleteRoom', getTime()], wrap(cb));
};

/**
 * Timekeeping.
 */

function getTime () {
	return (Date.now() / 1000).toString();
}

/**
 * Redis keys.
 */

function getKeys (room) {
	return [
		'counter',
		'room:' + room + ':nodes',
		'room:' + room + ':state',
		'room:' + room + ':length',
	];
}

var eventsChannel = 'events';

/**
 * Common callback wrapper.
 */

function wrap (cb) {
	if (!cb) { cb = function () {}; }
	return function (err, result) {
		if (err) { console.warn(err); return cb(err); }
		return cb(null, JSON.parse(result));
	};
}

/**
 * Server heartbeat.
 */

var _id = null;

function heartbeat () {
	scripts.run('heartbeat', ['servers:counter', 'servers:timeouts'], [getTime(), _id], wrap(function (err, result) {
		if (err) { return; }
		_id = result.id;
		if (result.dead) {
			result.dead.forEach(function (dead) {
				scripts.run('dead', ['server:' + dead + ':rooms', 'rooms:counts', 'rooms:timeouts'], [getTime()], wrap());
			});
		}
	}));
}

heartbeat();
setInterval(heartbeat, 30 * 1000);

/**
 * Rooms.
 */

Datastore.prototype.getTopRooms = function (cb) {
	scripts.run('browse', [
		'rooms:counts',
		'rooms:timeouts',
		'rooms:expired'
	], [getTime()], wrap(cb));
};

Datastore.prototype.join = function (room, cb) {
	scripts.run('join', [
		'server:' + _id + ':rooms',
		'rooms:counts',
		'rooms:timeouts',
		'rooms:expired',
		'room:' + room + ':nodes',
		'room:' + room + ':state',
		'room:' + room + ':length'
	], [room, getTime()], wrap(cb));
};

Datastore.prototype.leave = function (room, cb) {
	scripts.run('leave', [
		'server:' + _id + ':rooms',
		'rooms:counts',
		'rooms:timeouts',
	], [room, getTime()], wrap(cb));
};
