"use strict";
exports.__esModule = true;
var OnlineGame_1 = require("./OnlineGame");
var Session_1 = require("./Session");
var State_1 = require("./State");
var TournamentProfile = (function () {
    function TournamentProfile(tournament, player) {
        this.tournament = tournament;
        this.player = player;
        this.played = [];
        this.complete = false;
    }
    TournamentProfile.prototype.startPlaying = function (other) {
        this.played.push(other.player.token);
        this.opponent = other;
    };
    TournamentProfile.prototype.stopPlaying = function () {
        this.opponent = undefined;
    };
    TournamentProfile.prototype.isPlaying = function () {
        return this.opponent !== undefined;
    };
    TournamentProfile.prototype.currentOpponent = function () {
        return this.opponent;
    };
    TournamentProfile.prototype.isPlayable = function () {
        return !this.complete && !this.isPlaying() && this.player.alive();
    };
    TournamentProfile.prototype.canPlayGivenProfile = function (other) {
        return other !== this && this.isPlayable() && other.isPlayable() && this.played.indexOf(other.player.token) < 0;
    };
    TournamentProfile.prototype.isComplete = function () {
        return this.complete;
    };
    TournamentProfile.prototype.markAsComplete = function () {
        this.complete = true;
    };
    TournamentProfile.prototype.hasPlayed = function (other) {
        return this.played.filter(function (p) { return other.token === p; }).length > 0;
    };
    return TournamentProfile;
}());
exports.TournamentProfile = TournamentProfile;
var Tournament = (function () {
    function Tournament(name, socketServer, participants, options, ui) {
        var _this = this;
        this.name = name;
        this.socketServer = socketServer;
        this.participants = participants;
        this.options = options;
        this.ui = ui;
        this.started = false;
        this.profiles = this.participants.map(function (p) { return new TournamentProfile(_this, p); });
        this.stats = {
            started: this.started,
            players: {}
        };
        this.participants.forEach(function (playerA) {
            _this.stats.players[playerA.token] = {};
            _this.participants.forEach(function (playerB) {
                _this.stats.players[playerA.token][playerB.token] = {
                    started: false,
                    finished: false,
                    state: new State_1["default"](),
                    stats: null
                };
            });
        });
        this.complete = 0;
        this.started = false;
        this.flush();
    }
    Tournament.prototype.start = function () {
        if (!this.started && !this.isFinished()) {
            this.started = true;
            this.stats.started = true;
            this.flush();
        }
    };
    Tournament.prototype.startSession = function (session, settings) {
        this.socketServer.emitPayload('stats', 'session-start', { players: session.playerTokens() });
        var game = new OnlineGame_1["default"](this, session, this.socketServer, this.ui, settings);
        session.players.forEach(function (player) {
            player.session = session;
        });
        session.players.forEach(function (player, index) {
            session.registerHandler(index, 'disconnect', function () {
                game.handleGameEnd(player.otherPlayerInSession().getIndexInSession(), true);
            });
            session.registerHandler(index, 'game', game.handlePlayerMove(player));
        });
        game.playGame();
        this.stats.players[session.players[0].token][session.players[1].token].started = true;
        this.stats.players[session.players[1].token][session.players[0].token].started = true;
        this.sendUpdate();
    };
    Tournament.prototype.endSession = function (session) {
        var _this = this;
        session.terminate();
        session.players.forEach(function (player) {
            var profile = _this.profileByPlayer(player);
            profile.stopPlaying();
        });
        this.stats.players[session.players[0].token][session.players[1].token].finished = true;
        this.stats.players[session.players[1].token][session.players[0].token].finished = true;
        if (session.state && session.stats) {
            this.log('Updating stats between ' + session.players[0].token + ' and ' + session.players[1].token + ' ties: ' + session.state.ties);
            this.stats.players[session.players[0].token][session.players[1].token].state = session.state;
            this.stats.players[session.players[0].token][session.players[1].token].stats = session.stats;
            var state = session.state;
            state.wins = [state.wins[1], state.wins[0]];
            this.stats.players[session.players[1].token][session.players[0].token].state = session.state;
            this.stats.players[session.players[1].token][session.players[0].token].stats = state.getStats();
        }
        this.flush();
    };
    Tournament.prototype.isFinished = function () {
        return this.complete === this.profiles.length;
    };
    Tournament.prototype.profileByPlayer = function (player) {
        return this.profiles.filter(function (p) { return p.player.token === player.token; })[0];
    };
    Tournament.prototype.leftToPlay = function (profile) {
        var result = [];
        for (var _i = 0, _a = this.profiles; _i < _a.length; _i++) {
            var other = _a[_i];
            if (other !== profile && !profile.hasPlayed(other.player) && other.player.alive()) {
                result.push(other.player);
            }
        }
        return result.length;
    };
    Tournament.prototype.flush = function () {
        for (var _i = 0, _a = this.profiles; _i < _a.length; _i++) {
            var profile = _a[_i];
            if (!profile.isComplete() && !profile.isPlaying()) {
                for (var _b = 0, _c = this.profiles; _b < _c.length; _b++) {
                    var other = _c[_b];
                    if (profile.canPlayGivenProfile(other)) {
                        profile.startPlaying(other);
                        other.startPlaying(profile);
                    }
                }
                if (profile.isPlaying()) {
                    var session = new Session_1["default"]([profile.player, profile.currentOpponent().player]);
                    this.startSession(session, this.options);
                }
                else if (this.leftToPlay(profile) === 0) {
                    profile.markAsComplete();
                    this.complete++;
                    this.playerIsDone(profile);
                }
            }
        }
        this.sendUpdate();
    };
    Tournament.prototype.sendUpdate = function () {
        this.socketServer.emitPayload('tournament', 'stats', this.stats);
    };
    Tournament.prototype.playerIsDone = function (profile) {
        if (this.isFinished()) {
            this.log('Tournament completed');
            this.sendUpdate();
        }
    };
    Tournament.prototype.log = function (message, skipRender) {
        if (skipRender === void 0) { skipRender = false; }
        var time = (new Date()).toTimeString().substr(0, 5);
        if (this.ui) {
            this.ui.log(message, skipRender);
        }
        else {
            console.log(time, message);
        }
    };
    return Tournament;
}());
exports.Tournament = Tournament;
//# sourceMappingURL=Tournament.js.map