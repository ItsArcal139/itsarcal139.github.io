// import { Serializer } from "./utils";

var Assets = {
    preferredFont: `Rajdhani, "Noto Sans CJK TC", sans-serif`,
    loadImageAsset(name, source) {
        return new Promise((resolve, _) => {
            var img = new Image();
            img.onload = () => {
                this[name] = img;
                resolve();
            };
            img.src = source;
        });
    },
    loadAudioAsset(name, source) {
        return new Promise((resolve, _) => {
            var ctx = Game.currentGame.audioContext;
            fetch(source)
                .then(r => r.arrayBuffer())
                .then(buf => ctx.decodeAudioData(buf))
                .then(buf => {
                    this[name] = buf;
                    resolve();
                });
        });
    }
};

var Serializer = K.Serializer;

class BeatmapMeta {
    constructor({title, icon, background, audio, offset, ...params}) {
        this.title = title || "Unknown";
        this.icon = icon || "./assets/cover.jpeg";
        this.backgound = backgound || "./assets/cover.jpeg";
        this.audio = audio;
        this.offset = offset === undefined ? 0 : offset;

        Object.keys(params).forEach(s => {
            this[s] = params[s];
        });
    }
}

class Note {
    /** 
     * @param {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7} type - The note type.
     */
    constructor(type) {
        // Range: 0.0 ~ 1.0
        this.x = 0.5;
        this.tick = 0;
        this.pageIndex = 0;

        this.type = type;
        this.hasSibling = false;
        this.isForward = false;
    }

    /** @param {Game} game */
    update(game) {
        var page = game.chart.pages[this.pageIndex];
        var duration = Math.min(1250, game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength());
        var condition = Math.abs(game.tickTimeMap[game.currentTick] - game.tickTimeMap[this.tick]) < duration;
        if(this instanceof SliderNode) {
            condition = false;
        }

        if(this instanceof HoldNote || this instanceof LongHoldNote) {
            var endTime = this.getEndTick();
            condition = condition || (game.currentTick > this.tick && game.currentTick < endTime + game.getPage(endTime).getTickLength());
        }
        if(this instanceof SliderNote) {
            var endTime = this.getEndTick();
            condition = condition || (game.currentTick > this.tick && game.currentTick < endTime);
            condition = condition || (Math.abs(game.currentTick - endTime) < (game.getPage(endTime).getTickLength()));
        }
        
        if(condition) {
            this.render(game);
        }

        var page = game.chart.pages[this.pageIndex];

        var judgeTick = this.tick;
        if(this instanceof HoldNote || this instanceof LongHoldNote) {
            judgeTick = this.getEndTick();
        }
        if(game.currentTick > judgeTick && game.currentTick - judgeTick < page.getTickLength()) {
            if(this.clearTime == undefined) {
                this.clearTime = game.playbackTime;
            }
            if(!(this instanceof SliderNode)) {
                this.renderJudge(game);
            }
        } else {
            this.clearTime = null;
        }

        if(game.currentTick > this.tick && game.currentTick - this.tick < page.getTickLength()) {
            if(this.clickPlayedTime == undefined) {
                this.clickPlayedTime = game.playbackTime;
                game.playOneShotAudio(Assets.click_fx);
            }
        } else {
            this.clickPlayedTime = null;
        }
    }

    /** @param {Game} game */
    render(game) {

    }

    /** @param {Game} game */
    renderJudge(game) {
        var tick = game.currentTick;
        var page = game.chart.pages[this.pageIndex];

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, this.tick);
        if(this instanceof HoldNote) {
            y = game.getYPosition(page, this.getEndTick());
        }

        var spriteId = Math.round(Math.max(149, Math.min(159, K.Maths.lerp(149, 159, (game.playbackTime - this.clearTime) / 0.5))));
        var texture = Assets["perfect_" + spriteId];

        if(texture) {
            var w = texture.width / 193 * 175 * game.ratio;
            var h = texture.height / 193 * 175 * game.ratio;
            ctx.drawImage(texture, x - w / 2, y - h / 2, w, h);
        }
    }

    serialize() {
        return Serializer.serialize(this, [
            "x", "tick", "pageIndex", "type",
            "hasSibling", "isForward"
        ]);
    }

    static deserialize(data) {
        switch(data.type) {
            case 0:
                return CircleNote.deserialize(data);
            case 1:
                return HoldNote.deserialize(data);
            case 2:
                return LongHoldNote.deserialize(data);
            case 3:
            case 6:
                return SliderNote.deserialize(data);
            case 4:
            case 7:
                return SliderNode.deserialize(data);
            case 5:
                return FlickNote.deserialize(data);
            default:
                return Serializer.deserialize(data, Note);
        }
    }
}

class CircleNote extends Note {
    constructor() {
        super(0);
    }

    /** @param {Game} game */
    render(game) {
        super.render(game);
        var tick = game.currentTick;
        var page = game.chart.pages[this.pageIndex];

        var noteTime = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength());

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, this.tick);

        var spriteId = Math.round(Math.max(0, Math.min(51, K.Maths.lerp(1, 41, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["circle_" + spriteId];

        if(texture) {
            var size = texture.width / 193 * 150 * game.ratio;
            ctx.drawImage(texture, x - size / 2, y - size / 2, size, size);
        }
    }

    serialize() {
        return super.serialize();
    }

    static deserialize(data) {
        return Serializer.deserialize(data, CircleNote);
    }
}

class SliderNode extends Note {
    constructor(requiresHeadTap) {
        super(requiresHeadTap ? 7 : 4);
        this.nextId = 0;
    }

    isHeadTapRequired() {
        return this.type == 7;
    }

    serialize() {
        return {
            ...super.serialize(),
            next_id: this.nextId
        };
    }

    render(game) {
        super.render(game);
        var tick = game.currentTick;
        var page = game.chart.pages[this.pageIndex];

        var noteTime = game.tickTimeMap[this.tick];
        var duration = game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength();

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, this.tick);

        var spriteId = Math.round(Math.max(0, Math.min(66, K.Maths.lerp(1, 54, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["sn_" + spriteId];

        if(this.type == 7) {
            spriteId = Math.round(Math.max(0, Math.min(51, K.Maths.lerp(1, 41, (game.playbackTime * 1000 - noteTime) / duration + 1))));
            texture = Assets["circle_" + spriteId];
        }

        if(texture) {
            var w = texture.width / 193 * 75 * game.ratio;
            var h = texture.height / 193 * 75 * game.ratio;
            ctx.drawImage(texture, x - w / 2, y - h / 2, w, h);
        }
    }

    static deserialize(data) {
        return Serializer.deserialize(data, SliderNode);
    }
}

class SliderNote extends Note {
    constructor(requiresHeadTap) {
        super(requiresHeadTap ? 6 : 3);
        this.nextId = 0;

        /** @type {SliderNode[]} */
        this.nodes = null;
    }

    isHeadTapRequired() {
        return this.type == 6;
    }

    serialize() {
        return {
            ...super.serialize(),
            next_id: this.nextId
        };
    }

    /** @returns {SliderNode | SliderNote} */
    getLastNode() {
        var next = this;
        var nodes = this.nodes;
        if(!nodes) {
            nodes = [];
            var notes = Game.currentGame.chart.notes;
            while(next && next.nextId != 0) {
                nodes.push(next);
                next = notes.find(n => n.id == next.nextId);
            }
            this.nodes = nodes;
        }
        return nodes[nodes.length - 1];
    }

    getEndTick() {
        var node = this.getLastNode();
        return node ? node.tick : this.tick;
    }

    /** @param {Game} game */
    drawDashedPath(game) {
        var ctx = game.context;
        var page = game.chart.pages[this.pageIndex];
        var points = [];
        this.nodes.forEach(n => {
            var nextX = (game.canvas.width - game.fieldWidth) / 2 + n.x * game.fieldWidth;
            var nextY = game.getYPosition(game.chart.pages[n.pageIndex], n.tick);
            points.push({
                x: nextX, y: nextY, note: n
            });
        });

        var prevPoint = {
            x: (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth,
            y: game.getYPosition(page, this.tick),
            note: this
        };

        ctx.strokeStyle = this.type == 3 ? "#baacc8" : "#bbdefb";
        ctx.lineWidth = 16 * game.ratio;
        ctx.setLineDash([8 * game.ratio, 8 * game.ratio]);

        points.forEach(p => {
            var start = game.chart.pages[prevPoint.note.pageIndex - 1];
            var startTime = game.tickTimeMap[start ? K.Maths.lerp(start.startTick, start.endTick, 0.5) : 0];
            var segmentStartTime = game.tickTimeMap[prevPoint.note.tick];
            var segmentEndTime = game.tickTimeMap[p.note.tick];
            var time = game.playbackTime * 1000;

            if(time >= startTime && time < segmentEndTime) {
                ctx.globalAlpha = Math.pow(Math.max(0, ((time - startTime) / (segmentEndTime - startTime))), 0.5);
                ctx.beginPath();
                ctx.moveTo(prevPoint.x, prevPoint.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
            }
            prevPoint = p;
        });
        
        ctx.globalAlpha = 1;
        ctx.lineWidth = 0;
        ctx.setLineDash([]);
    }

    /** @param {Game} game */
    getCurrentPos(game) {
        var ctx = game.context;
        var page = game.chart.pages[this.pageIndex];
        var points = [];
        this.nodes.forEach(n => {
            var nextX = (game.canvas.width - game.fieldWidth) / 2 + n.x * game.fieldWidth;
            var nextY = game.getYPosition(game.chart.pages[n.pageIndex], n.tick);
            points.push({
                x: nextX, y: nextY, note: n
            });
        });

        var prevPoint = {
            x: (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth,
            y: game.getYPosition(page, this.tick),
            note: this
        };

        ctx.strokeStyle = this.type == 3 ? "#ce93d8" : "#bbdefb";
        ctx.lineWidth = 15 * game.ratio;
        ctx.setLineDash([5 * game.ratio, 5 * game.ratio]);

        var result = new K.Vector2(prevPoint.x, prevPoint.y);
        var over = false;
        points.forEach(p => {
            var segmentStartTime = game.tickTimeMap[prevPoint.note.tick];
            var segmentEndTime = game.tickTimeMap[p.note.tick];
            var time = game.playbackTime * 1000;

            if(time >= segmentStartTime && time < segmentEndTime) {
                result = K.Vector2.lerp(new K.Vector2(prevPoint.x, prevPoint.y), new K.Vector2(p.x, p.y), (time - segmentStartTime) / (segmentEndTime - segmentStartTime));
            }
            over = (time >= segmentEndTime);
            prevPoint = p;
        });

        if(over) {
            return prevPoint;
        }

        return result;
    }

    render(game) {
        super.render(game);

        var tick = game.currentTick;
        var page = game.chart.pages[this.pageIndex];

        var endTick = this.getEndTick();
        var noteTime = game.tickTimeMap[tick > this.tick ? (tick < endTick ? tick : endTick) : this.tick];
        var duration = game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength();

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, this.tick);

        var spriteId = Math.round(Math.max(0, Math.min(66, K.Maths.lerp(1, 54, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["slider_" + spriteId];

        if(this.type == 6) {
            spriteId = Math.round(Math.max(0, Math.min(51, K.Maths.lerp(1, 40, (game.playbackTime * 1000 - noteTime) / duration + 1))));
            texture = Assets["circle_" + spriteId];
        }

        if(texture) {
            var points = [];
            var next = game.chart.notes.find(n => n.id == this.nextId);
            while(next && next.nextId != 0) {
                var nextX = (game.canvas.width - game.fieldWidth) / 2 + next.x * game.fieldWidth;
                var nextY = game.getYPosition(game.chart.pages[next.pageIndex], next.tick);
                points.push({
                    x: nextX, y: nextY, note: next
                });
                next = game.chart.notes.find(n => n.id == next.nextId);
            }
            next = points.find(p => p.note.tick > game.currentTick) || points[0];

            for(var i = points.length - 1; i >= 0; i--) {
                var n = points[i].note;
                n.render(game);
            }

            var {x, y} = this.getCurrentPos(game);

            var w = texture.width / 193 * 150 * game.ratio;
            var h = texture.height / 193 * 150 * game.ratio;
            var t = ctx.getTransform();
            ctx.translate(x, y);

            // var next = game.chart.notes.find(n => n.id == this.nextId);
            var nextX = next.x; // (game.canvas.width - game.fieldWidth) / 2 + next.x * game.fieldWidth;
            var nextY = next.y; //game.getYPosition(game.chart.pages[next.pageIndex], next.tick);
            var nextD = Math.sqrt(Math.pow(nextX, 2) + Math.pow(nextY, 2));

            var nextPos = new K.Vector2(nextX, nextY);
            var thisPos = new K.Vector2(x, y);
            var nm = nextPos.minus(thisPos).normalize();

            ctx.rotate(-Math.PI / 4);
            ctx.transform(-nm.y, nm.x, -nm.x, -nm.y, 0, 0);
            ctx.drawImage(texture, -w / 2, -h / 2, w, h);
            ctx.setTransform(t);

            for(var i = points.length - 1; i >= 0; i--) {
                var n = points[i].note;
                if(n.clearTime) {
                    n.renderJudge(game);
                }
            }
        }
    }

    static deserialize(data) {
        return Serializer.deserialize(data, SliderNote);
    }
}

class HoldNote extends Note {
    constructor() {
        super(1);
        this.holdTick = 0;
    }

    serialize() {
        return {
            ...super.serialize(),
            hold_tick: this.holdTick
        };
    }

    getEndTick() {
        return this.tick + this.holdTick;
    }

    renderLine(game) {
        var ctx = game.context;
        var page = game.chart.pages[this.pageIndex];
        var noteTime = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength());

        var startY = game.getYPosition(page, this.tick);
        var endY = game.getYPosition(page, this.getEndTick());
        var dist = endY - startY;
        dist = (dist / Math.abs(dist)) * 21 * game.ratio;

        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        
        var spriteId = Math.round(Math.max(0, Math.min(46, K.Maths.lerp(0, 46, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["hold_line_" + spriteId];

        if(texture) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x - 100 * game.ratio, startY, 200 * game.ratio, endY - startY);
            ctx.clip();
            var count = Math.ceil((endY - startY) / dist);
            for(var i=0; i<count; i++) {
                var y = dist + startY + i * dist;
                ctx.drawImage(texture, x - texture.width / 2 * game.ratio, y - texture.height / 2 * game.ratio, texture.width * game.ratio, texture.height * game.ratio);
            }
            ctx.restore();
        }
    }

    /** @param {Game} game */
    renderFire(game) {
        var startPage = game.chart.pages[this.pageIndex];
        var page = game.getPage(game.currentTick);
        var direction = page.scanLineDirection;
        var tick = game.currentTick;

        var time = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(startPage.startTick + 1, game.chart.timeBase) * startPage.getTickLength());

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, tick);

        var spriteId = Math.round(Math.max(0, K.Maths.lerp(0, 30, (game.playbackTime * 1000 - time) / duration + 1)));
        spriteId %= 31;
        var texture = Assets["hold_fire_" + spriteId];

        if(texture) {
            var w = texture.width / 193 * 150 * game.ratio;
            var h = texture.height / 193 * 150 * game.ratio;

            if(direction == 1) {
                ctx.drawImage(texture, x - w / 2, y - 50 * game.ratio, w, h);
            } else {
                ctx.scale(1, -1);
                ctx.drawImage(texture, x - w / 2, -y - 50 * game.ratio, w, h);
                ctx.scale(1, -1);
            }
        }
    }

    /** @param {Game} game */
    render(game) {
        super.render(game);

        var tick = game.currentTick;
        var endTick = this.getEndTick();
        var page = game.chart.pages[this.pageIndex];

        var noteTime = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength());

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, this.tick);
        if(tick > endTick) y = game.getYPosition(page, endTick);

        var spriteId = Math.round(Math.max(0, Math.min(59, K.Maths.lerp(1, 40, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["hold_" + spriteId];

        if(tick >= this.tick && tick < endTick) {
            spriteId = Math.round(K.Maths.lerp(0, 8, (game.playbackTime * 1000 - noteTime) / duration * 4));
            spriteId %= 9;
            texture = Assets["hold_btn_" + (spriteId + 41)];

            var backSpriteId = Math.round(K.Maths.lerp(0, 15, (game.playbackTime * 1000 - noteTime) / duration * 4));
            backSpriteId %= 16;
            var backTexture = Assets["hold_back_" + (spriteId + 41)];

            if(backTexture) {
                var w = backTexture.width / 193 * 150 * game.ratio;
                var h = backTexture.height / 193 * 150 * game.ratio;
                ctx.drawImage(backTexture, x - w / 2, y - h / 2, w, h);
            }
        }

        if(tick >= endTick) {
            spriteId = Math.round(K.Maths.lerp(57, 74, (game.playbackTime * 1000 - game.tickTimeMap[endTick]) / duration));
            texture = Assets["hold_" + spriteId];
        } else {
            this.renderLine(game);
        }

        if(texture) {
            var w = texture.width / 193 * 150 * game.ratio;
            var h = texture.height / 193 * 150 * game.ratio;
            ctx.drawImage(texture, x - w / 2, y - h / 2, w, h);
        }

        if(tick >= this.tick && tick < endTick) {
            ctx.setLineDash([]);
            var hp = (tick - this.tick) / this.holdTick;
            
            var size = 115 * game.ratio;
            var c = "#ad1457";
            var ra = Math.PI * 0.5;
            ctx.lineWidth = 15 * game.ratio;
            ctx.strokeStyle = "#fff";

            ctx.beginPath();
            ctx.arc(x, y, size, -ra, -ra + Math.PI * 2 * hp * (1 / 0.75));
            ctx.stroke();
            ctx.strokeStyle = c;
            ctx.beginPath();
            ctx.arc(x, y, size, -ra, -ra + Math.PI * 2 * hp);
            ctx.stroke();

            this.renderFire(game);
        }

        ctx.lineWidth = 0;
    }

    static deserialize(data) {
        return Serializer.deserialize(data, HoldNote);
    }
}

class FlickNote extends Note {
    constructor() {
        super(5);
    }

    /** @param {Game} game */
    render(game) {
        super.render(game);
        var tick = game.currentTick;
        var page = game.chart.pages[this.pageIndex];

        var noteTime = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength());

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, this.tick);

        var spriteId = Math.round(Math.max(0, Math.min(59, K.Maths.lerp(1, 41, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["flick_" + spriteId];

        if(texture) {
            var w = texture.width / 193 * 150 * game.ratio;
            var h = texture.height / 193 * 150 * game.ratio;
            ctx.drawImage(texture, x - w / 2, y - h / 2, w, h);
        }
    }

    static deserialize(data) {
        return Serializer.deserialize(data, FlickNote);
    }
}

class LongHoldNote extends Note {
    constructor() {
        super(2);
        this.holdTick = 0;
    }

    serialize() {
        return {
            ...super.serialize(),
            hold_tick: this.holdTick
        };
    }

    getEndTick() {
        return this.tick + this.holdTick;
    }

    /** @param {Game} game */
    renderLine(game) {
        var tick = game.currentTick;
        var ctx = game.context;
        var page = game.chart.pages[this.pageIndex];
        var noteTime = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength());

        var spriteId = Math.round(Math.max(0, Math.min(17, K.Maths.lerp(0, 17, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["lh_line_" + spriteId];

        var endTick = this.getEndTick();

        var animateDuration = game.tickTimeMap[this.tick + this.holdTick] - game.tickTimeMap[this.tick];
        var offset = 0;
        if(animateDuration > 1500) offset = animateDuration - 1500;
        animateDuration = Math.min(1500, animateDuration);

        if(tick >= this.tick && tick < endTick) {
            spriteId = Math.round(Math.max(17, Math.min(57, K.Maths.lerp(17, 57, (game.playbackTime * 1000 - noteTime - offset) / animateDuration))));
            texture = Assets["lh_line_" + spriteId];
        }

        var scale = 0.75;
        var startY = game.canvas.height;
        var endY = 0;
        var dist = endY - startY;
        dist = (dist / Math.abs(dist)) * texture.height * game.ratio * scale;

        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;

        if(texture) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x - 100 * game.ratio, startY, 200 * game.ratio, endY - startY);
            ctx.clip();
            var count = Math.ceil((endY - startY) / dist);
            for(var i=0; i<=count; i++) {
                var y = startY + i * dist;
                ctx.drawImage(texture, x - texture.width / 2 * scale, y - texture.height / 2 * scale, texture.width * scale, texture.height * scale);
            }
            ctx.restore();
        }
    }

    /** @param {Game} game */
    renderFire(game) {
        var startPage = game.chart.pages[this.pageIndex];
        var page = game.getPage(game.currentTick);
        var direction = page.scanLineDirection;
        var tick = game.currentTick;

        var time = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(startPage.startTick + 1, game.chart.timeBase) * startPage.getTickLength());

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, tick);

        var spriteId = Math.round(Math.max(0, K.Maths.lerp(0, 30, (game.playbackTime * 1000 - time) / duration + 1)));
        spriteId %= 31;
        var texture = Assets["lh_fire_" + spriteId];

        if(texture) {
            var w = texture.width / 193 * 150 * game.ratio;
            var h = texture.height / 193 * 150 * game.ratio;

            if(direction == 1) {
                ctx.drawImage(texture, x - w / 2, y - 50 * game.ratio, w, h);
            } else {
                ctx.scale(1, -1);
                ctx.drawImage(texture, x - w / 2, -y - 50 * game.ratio, w, h);
                ctx.scale(1, -1);
            }
        }
    }

    /** @param {Game} game */
    render(game) {
        super.render(game);

        var tick = game.currentTick;
        var endTick = this.getEndTick();
        var page = game.chart.pages[this.pageIndex];

        var noteTime = game.tickTimeMap[this.tick];
        var duration = Math.min(1250, game.getMsPerTick(page.startTick + 1, game.chart.timeBase) * page.getTickLength());

        var ctx = game.context;
        var x = (game.canvas.width - game.fieldWidth) / 2 + this.x * game.fieldWidth;
        var y = game.getYPosition(page, this.tick);

        var spriteId = Math.round(Math.max(0, Math.min(40, K.Maths.lerp(0, 40, (game.playbackTime * 1000 - noteTime) / duration + 1))));
        var texture = Assets["lh_" + spriteId];

        if(tick >= this.tick && tick < endTick) {
            spriteId = Math.round(Math.max(0, K.Maths.lerp(0, 8, (game.playbackTime * 1000 - noteTime) / duration)));
            spriteId %= 9;
            texture = Assets["lh_btn_" + (spriteId + 41)];

            var backSpriteId = Math.round(K.Maths.lerp(0, 17, (game.playbackTime * 1000 - noteTime) / duration));
            var isLoop = backSpriteId >= 17;
            if(isLoop) backSpriteId = (backSpriteId - 17) % 15;
            var backTexture = Assets["lh_back_" + (isLoop ? "loop" : "in") + "_" + ((isLoop ? 58 : 41) + backSpriteId)];

            if(backTexture) {
                var w = backTexture.width / 193 * 150 * game.ratio;
                var h = backTexture.height / 193 * 150 * game.ratio;
                ctx.drawImage(backTexture, x - w / 2, y - h / 2, w, h);
            }
        }

        if(tick >= endTick) {
            spriteId = Math.round(K.Maths.lerp(57, 74, (game.playbackTime * 1000 - game.tickTimeMap[endTick]) / duration));
            texture = Assets["lh_" + spriteId];
        } else {
            this.renderLine(game);
        }

        if(texture) {
            var w = texture.width / 193 * 150 * game.ratio;
            var h = texture.height / 193 * 150 * game.ratio;
            ctx.drawImage(texture, x - w / 2, y - h / 2, w, h);
        }

        if(tick >= this.tick && tick < endTick) {
            ctx.setLineDash([]);
            var hp = (tick - this.tick) / this.holdTick;
            
            var size = 115 * game.ratio;
            var c = "#fdd835";
            var ra = Math.PI * 0.5;
            ctx.lineWidth = 15 * game.ratio;
            ctx.strokeStyle = "#fff";

            ctx.beginPath();
            ctx.arc(x, y, size, -ra, -ra + Math.PI * 2 * hp * (1 / 0.75));
            ctx.stroke();
            ctx.strokeStyle = c;
            ctx.beginPath();
            ctx.arc(x, y, size, -ra, -ra + Math.PI * 2 * hp);
            ctx.stroke();

            this.renderFire(game);
        }

        ctx.lineWidth = 0;
    }

    static deserialize(data) {
        return Serializer.deserialize(data, LongHoldNote);
    }
}

class AnimatedObject {
    constructor() {
        this.data = {};
        this.update = () => {};
        this.isFinished = false;
    }
}

var NoteType = {
    circle: 0,
    hold: 1,
    longHold: 2,
    sliderHead: 3,
    sliderNode: 4,
    flick: 5,
    clickSliderHead: 6,
    clickSliderNode: 7
};

class Page {
    constructor() {
        this.startTick = 0;
        this.endTick = 0;
        this.scanLineDirection = 0;
    }

    getTickLength() {
        return this.endTick - this.startTick;
    }

    serialize() {
        return Serializer.serialize(this);
    }

    static deserialize(data) {
        return Serializer.deserialize(data, Page);
    }
}

class EventOrder {
    constructor() {
        this.tick = 0;

        /** @type {0 | 1} */
        this.type = 1;

        // R, G, W
        /** @type {"R" | "G" | "W"} */
        this.color = "";
    }

    serialize() {
        return {
            tick: this.tick,
            event_list: [
                {
                    type: this.type,
                    args: this.color
                }
            ]
        };
    }

    static deserialize(data) {
        var result = new EventOrder();
        result.tick = data.tick;
        result.type = data.event_list[0].type;
        result.color = data.event_list[0].args;
        return result;
    }

    /** @param {Game} game */
    render(game) {
        var eventTime = game.tickTimeMap[this.tick];
        var deltaTime = game.playbackTime * 1000 - eventTime;
        if(deltaTime < 0) return;
        if(deltaTime > 5000) return;
        
        var page = game.getPage(this.tick);
        var canvas = game.canvas;
        var ctx = game.context;

        var font1 = "Rajdhani, 'Noto Sans CJK TC'";
        var font2 = "Electronize, 'Noto Sans CJK TC'";

        ctx.font = `700 ${35 * game.ratio}px ${font1}`;
        ctx.fillStyle = this.type == 0 ? "#d81b60" : "#4db6ac";

        ctx.textAlign = "center";
        if(deltaTime < 2000) {
            var alpha = 1;
            var space = ctx.measureText("W").width;
            if(deltaTime > 750) {
                space += ((deltaTime - 750) / 1000 * 80 * game.ratio);
                alpha = Math.max(0, 1 - ((deltaTime - 750) / 1000));
            }

            var drawText = (txt, y) => {
                var width = space * (txt.length - 1);
                for(var i=0; i<txt.length; i++) {
                    var c = txt[i];
                    var x = canvas.width / 2 - width / 2 + space * i;
                    ctx.fillText(c, x, y);
                }
            }
            
            var y = canvas.height - 50 * game.ratio;

            ctx.globalAlpha = alpha * 0.25;
            ctx.fillStyle = "#000";
            drawText(this.type == 0 ? "SPEED UP" : "SPEED DOWN", y + 10 * game.ratio);

            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.type == 0 ? "#d81b60" : "#4db6ac";
            drawText(this.type == 0 ? "SPEED UP" : "SPEED DOWN", y);
        }

        var alpha = 1;
        if(deltaTime >= 0 && deltaTime < 500) alpha = K.Maths.lerp(0, 1, deltaTime / 500);
        if(deltaTime > 4000) alpha = K.Maths.lerp(1, 0, (deltaTime - 4000) / 1000)
        ctx.globalAlpha = alpha;

        var page = game.getPage(game.currentTick);
        var y = game.getYPosition(page, game.currentTick);
        ctx.fillRect(0, y - 1.5 * game.ratio, canvas.width, 3 * game.ratio);
        
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
    }
}

class Tempo {
    constructor() {
        this.tick = 0;

        // n microseconds = timeBase ticks
        this.value = 0;
    }

    serialize() {
        return {
            tick: this.tick,
            value: this.value * 1000
        };
    }

    static deserialize(data) {
        var result = new Tempo();
        result.tick = data.tick;
        result.value = data.value / 1000;
        return result;
    }
}

class Beatmap {
    constructor() {
        this.formatVersion = 2;
        this.timeBase = 480;
        this.startOffsetTime = 0;

        /** @type {Page[]} */
        this.pages = [];
        
        /** @type {Tempo[]} */
        this.tempos = [];

        /** @type {EventOrder[]} */
        this.eventOrders = [];

        /** @type {Note[]} */
        this.notes = [];
    }

    static deserialize(data) {
        var map = Serializer.deserialize(data, Beatmap, [
            "format_version", "time_base", "start_offset_time"
        ]);
        map.pages = data.page_list.map(p => Page.deserialize(p));
        map.tempos = data.tempo_list.map(t => Tempo.deserialize(t)).sort((a, b) => b.tick - a.tick);
        map.notes = data.note_list.map(n => Note.deserialize(n));
        map.eventOrders = data.event_order_list.map(e => EventOrder.deserialize(e));

        // Cache slider nodes data for further use.
        map.notes.forEach(n => {
            if(n instanceof SliderNote) {
                var nodes = [];
                var notes = map.notes;
                var next = notes.find(nn => nn.id == n.nextId);
                while(next && next.nextId != 0) {
                    nodes.push(next);
                    next = notes.find(nn => nn.id == next.nextId);
                }
                n.nodes = nodes;
            }
        });
        return map;
    }

    serialize() {
        var data = Serializer.serialize(this, [
            "formatVersion", "timeBase", "startOffsetTime"
        ]);

        data = {
            ...data,
            page_list: this.pages.map(p => p.serialize()),
            tempo_list: this.tempos.map(t => t.serialize()),
            event_order_list: this.eventOrders.map(e => e.serialize()),
            note_list: this.notes.map(n => n.serialize())
        }
    }
}

class LogLine {
    constructor(content) {
        this.y = null; // Updated by Game.update()
        this.content = content;
        this.createdTime = null;
        this.fadedTime = null;

        this.badge = {
            text: "Debug",
            background: "#888",
            color: "white"
        };

        this.persistent = false;
        this.hidden = false;
    }
}

class Game {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas, { audioCompatMode }) {
        Game.currentGame = this;
        this.canvas = canvas;
        this.context = canvas.getContext("2d");
        canvas.width = screen.height < screen.width ? screen.width * devicePixelRatio : screen.height * devicePixelRatio;
        canvas.height = screen.height < screen.width ? screen.height * devicePixelRatio : screen.width * devicePixelRatio;

        this._initSize = {
            w: canvas.width, h: canvas.height
        };
        this.setResolutionScale(1);
        /** @type {boolean} */
        this.audioCompatMode = audioCompatMode;
        /** @type {AudioBuffer} */
        this.activeAudioBuffer = null;
        this.setupAudio();
        
        // Song information.
        this.themeColor = "#ff441f";
        this.musicTitle = "Unknown";
        this.chartDifficulty = {
            name: "CHAOS",
            color: "#a81ca8",
            backColor: "#a81ca8",
            level: 14
        };

        this.tickTimeMap = [];

        /** @type {Beatmap} */
        this.chart = null;

        /** @type {HTMLImageElement} */
        this.background = null;
        Assets.loadImageAsset("default_bg", "./assets/bg_gamever.png").then(() => {
            this.background = Assets.default_bg;
        });

        /** @type {HTMLImageElement} */
        this.icon = null;
        Assets.loadImageAsset("default_icon", "./assets/Icon.png").then(() => {
            this.icon = Assets.default_icon;
        });

        this.setupNoteAssets();
        this.setupOtherAssets();

        /** @type {AnimatedObject[]} */
        this.animatedObjects = [];

        // Config.
        this.maxFPS = 300;
        
        // Game state data
        this.lastRenderTime = 0;
        this.currentTick = 0;
        this.playbackTime = 0;
        this.lastScore = 0;

        // Debugger
        this.enableDebugLog = false;
        this.debugLogCount = 10;
        this.debugLines = [];
        this.defaultLines = {};
        this.setupDefaultDebugLines();

        this.update();
    }

    /**
     * @param {Beatmap} map
     */
    parseMap(map, { audio, ...meta }) {
        this.chart = map;
        var pages = map.pages.sort((a, b) => a.startTick - b.startTick);
        var totalTicks = pages[pages.length - 1].endTick;
        var timeBase = map.timeBase;

        var counter = 0;
        this.tickTimeMap = [0];

        for(var i=0; i<totalTicks; i++) {
            var currentMsPerTick = this.getMsPerTick(i, timeBase);
            counter += currentMsPerTick;
            this.tickTimeMap.push(counter);
        }

        // Meta
        this.playMusic(audio);
        if(meta.title) {
            this.musicTitle = meta.title;
        }
        if(meta.difficulty) {
            this.chartDifficulty = {
                name: meta.difficulty.name,
                color: meta.difficulty.color,
                backColor: meta.difficulty.color,
                level: meta.difficulty.level,
            };
        }
    }

    setPlaybackRate(rate) {
        this.audioElem.playbackRate = rate;
        if(!this.audioCompatMode) {
            this.audioSource.playbackRate.value = rate;
        }
    }

    playMusic(src) {
        this.audioElem.src = src;
        if(!this.audioCompatMode) {
            var ctx = this.audioContext;
            fetch(src)
                .then(r => r.arrayBuffer())
                .then(buf => ctx.decodeAudioData(buf))
                .then(buf => {
                    this.activeAudioBuffer = buf;
                    var s = ctx.createBufferSource();
                    s.buffer = buf;

                    if(this.audioSource != null) {
                        this.audioSource.stop();
                        this.audioSource.disconnect();
                    }
                    this.audioSource = s;
                    s.connect(this.audioAnalyser);
                    s.start(0);
                    this.audioElem.play();
                });
        } else {
            this.audioElem.play();
        }
    }

    getTempo(tick) {
        var map = this.chart;
        var tempos = map.tempos;
        
        var result = tempos.find(t => t.tick <= tick);
        return result || tempos[0];
    }

    getMsPerTick(tick, timeBase) {
        return this.getTempo(tick).value / timeBase
    }

    loadMap(src, meta) {
        fetch(src, {
            cache: "no-cache"
        }).then(r => r.json())
        .then(json => {
            this.parseMap(Beatmap.deserialize(json), meta);
        });
    }

    setupAudio() {
        this.audioElem = document.getElementById("game-audio");

        /** @type {AudioContext} */
        var ctx = this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        /** @type {AudioBufferSourceNode} */
        this.audioSource = null;
        ctx.suspend();

        this.audioAnalyser = ctx.createAnalyser();
        if(!this.audioCompatMode) {
            var src = ctx.createMediaElementSource(this.audioElem);

            var gn = ctx.createGain();
            gn.gain.value = 0;
            src.connect(gn);
            gn.connect(this.audioAnalyser);

            this.audioElem.addEventListener("play", e => {
                var s = ctx.createBufferSource();
                s.buffer = this.activeAudioBuffer;

                if(this.audioSource != null) {
                    s.playbackRate.value = this.audioSource.playbackRate.value;
                    this.audioSource.stop();
                    this.audioSource.disconnect();
                }
                this.audioSource = s;
                s.connect(this.audioAnalyser);
                s.start(0, this.audioElem.currentTime);
                this.isPlaying = true;
                this.playbackTime = this.audioElem.currentTime;
            });
            
            this.audioElem.addEventListener("pause", e => {
                this.audioSource.stop();
                this.isPlaying = false;
            });
        }

        var gain = this.gainNode = ctx.createGain();
        gain.gain.value = 1.0;
        this.audioAnalyser.connect(gain).connect(this.audioContext.destination);
    }

    setupPlayfield() {
        var canvas = this.canvas;
        this.fieldWidth = canvas.width * 0.85;
        this.fieldHeight = canvas.height - 275 * this.ratio;
    }

    setResolutionScale(ratio) {
        ratio = this.ratio = ratio || window.devicePixelRatio;
        var canvas = this.canvas;
        canvas.width = this._initSize.w * ratio;
        canvas.height = this._initSize.h * ratio;

        this.setupPlayfield();
    }

    setupNoteAssets() {
        for(var i=1; i<=40; i++) {
            Assets.loadImageAsset("circle_" + i, `./assets/circle/Note-Click-Enter-Textures-Click_in_000${i<10?"0":""}${i}.png`);
            Assets.loadImageAsset("flick_" + i, `./assets/flick/Note-Flick-Enter-Textures-Flick_in_000${i<10?"0":""}${i}.png`);
        }

        for(var i=41; i<=50; i++) {
            Assets.loadImageAsset("circle_" + i, `./assets/circle/Note-Click-Bloom-Textures-Click_Boom_000${i<10?"0":""}${i}.png`);
            Assets.loadImageAsset("flick_" + i, `./assets/flick/Note-Flick-Bloom-Textures-Flick_BoomR_000${i<10?"0":""}${i}.png`);
        }

        for(var i=51; i<=58; i++) {
            Assets.loadImageAsset("flick_" + i, `./assets/flick/Note-Flick-Bloom-Textures-Flick_BoomR_000${i<10?"0":""}${i}.png`);
        }

        for(var i=146; i<=158; i++) {
            var j = 12 - i + 146;
            Assets.loadImageAsset("perfect_" + i, `./assets/perfect2/Perfect_00${j<10?"0":""}${j}_PERFECT_Gold_top_00${i}.png`);
        }

        for(var i=1; i<=47; i++) {
            Assets.loadImageAsset("sn_" + i, `./assets/drag_child/Note-DragChild-Textures-DragChild_in_000${i<10?"0":""}${i}.png`);
            Assets.loadImageAsset("slider_" + i, `./assets/drag_head/Note-Drag-Enter-Textures-Drag_in_000${i<10?"0":""}${i}.png`);
        }

        for(var i=48; i<=54; i++) {
            Assets.loadImageAsset("sn_" + i, `./assets/drag_child/Note-DragChild-Textures-DragChild_in_00047.png`);
            Assets.loadImageAsset("slider_" + i, `./assets/drag_head/Note-Drag-Enter-Textures-Drag_in_00047.png`);
        }

        for(var i=41; i<=50; i++) {
            var j = i + 14;
            Assets.loadImageAsset("sn_" + j, `./assets/drag_head/Note-Drag-Bloom-Textures-Drag_Boom_000${i<10?"0":""}${i}.png`);
            Assets.loadImageAsset("slider_" + j, `./assets/drag_head/Note-Drag-Bloom-Textures-Drag_Boom_000${i<10?"0":""}${i}.png`);
        }

        for(var i=1; i<=40; i++) {
            Assets.loadImageAsset("hold_" + i, `./assets/hold/Note-Hold-Enter-Textures-Hold_Note-Hold_in_000${i<10?"0":""}${i}.png`);
        }
        for(var i=41; i<=56; i++) {
            Assets.loadImageAsset("hold_back_" + i, `./assets/hold/Note-Hold-Holding-Textures-Hold_Back-Hold_Back_000${i}.png`);
        }
        for(var i=41; i<=49; i++) {
            Assets.loadImageAsset("hold_btn_" + i, `./assets/hold/Note-Hold-Holding-Textures-Hold_Button_in-Hold_Button_in_000${i}.png`);
        }
        for(var i=1; i<=30; i++) {
            Assets.loadImageAsset("hold_fire_" + i, `./assets/hold/Note-Hold-Holding-Textures-Hold_Fire-Hold_Fire_000${i<10?"0":""}${i}.png`);
        }
        for(var i=57; i<=74; i++) {
            Assets.loadImageAsset("hold_" + i, `./assets/hold/Note-Hold-Bloom-Textures-Hold_Boom_000${i}.png`);
            Assets.loadImageAsset("lh_" + (i + 1), `./assets/longhold/Note-LongHold-Bloom-Textures-LongHold_Boom_000${(i + 1)}.png`);
        }

        for(var i=0; i<=46; i++) {
            Assets.loadImageAsset("hold_line_" + i, `./assets/hold/Hold_Line_Single_000${i<10?"0":""}${i}.png`);
        }

        for(var i=0; i<=40; i++) {
            Assets.loadImageAsset("lh_" + i, `./assets/longhold/Note-LongHold-Enter-Textures-LongHold_in-LongHold_in_000${i<10?"0":""}${i}.png`);
        }

        for(var i=0; i<=57; i++) {
            var j = 1874 + i;
            Assets.loadImageAsset("lh_line_" + i, `./assets/longhold/Hold_Line_Sample_0${j}.png`);
        }
        for(var i=41; i<=58; i++) {
            Assets.loadImageAsset("lh_back_in_" + i, `./assets/longhold/Note-LongHold-Holding-Textures-LongHold_Back_in-LongHold_Back_in_000${i}.png`);
        }
        for(var i=58; i<=73; i++) {
            Assets.loadImageAsset("lh_back_loop_" + i, `./assets/longhold/Note-LongHold-Holding-Textures-LongHold_Back_loop-LongHold_Back_loop_000${i}.png`);
        }
        for(var i=41; i<=57; i++) {
            Assets.loadImageAsset("lh_btn_" + i, `./assets/longhold/Note-LongHold-Holding-Textures-LongHold_Button_in-LongHold_Button_in_000${i<10?"0":""}${i}.png`);
        }
        for(var i=58; i<=75; i++) {
            Assets.loadImageAsset("lh_" + i, `./assets/longhold/Note-LongHold-Bloom-Textures-LongHold_Boom_000${i<10?"0":""}${i}.png`);
        }

        for(var i=0; i<=30; i++) {
            Assets.loadImageAsset("hold_fire_" + i, `./assets/hold/Note-Hold-Holding-Textures-Hold_Fire-Hold_Fire_000${i<10?"0":""}${i}.png`);
            Assets.loadImageAsset("lh_fire_" + i, `./assets/longhold/Note-LongHold-Holding-Textures-LongHold_Fire-LongHold_Fire_000${i<10?"0":""}${i}.png`);
        }
    }

    setupOtherAssets() {
        for(var i=0; i<=85; i++) {
            Assets.loadImageAsset("mm_" + i, `./assets/mm/MM_Logo-MM_Logo_000${i<10?"0":""}${i}.png`);
        }
        Assets.loadAudioAsset("mm_audio", "./assets/mm/mm_sound.wav");
        Assets.loadAudioAsset("click_fx", "./assets/tapFX_3.wav");
    }

    playMMEffect() {
        this.playOneShotAudio(Assets.mm_audio);
        var obj = new AnimatedObject();
        obj.data.startTime = performance.now();
        obj.update = game => {
            var ctx = this.context;
            var time = performance.now() - obj.data.startTime;
            var duration = 3000;
            var spriteId = Math.round(Math.max(0, Math.min(85, K.Maths.lerp(0, 85, time / duration))));
            if(spriteId > 36 && spriteId < 65) spriteId = 36;
            var texture = Assets["mm_" + spriteId];

            var x = this.canvas.width / 2;
            var y = this.canvas.height / 2;
            var size = 1.5 * this.ratio;

            if(texture) {
                ctx.drawImage(texture, x - texture.width / 2 * size, y - texture.height / 2 * size, texture.width * size, texture.height * size);
            }

            if(time > duration) obj.isFinished = true;
        };
        this.animatedObjects.push(obj);
    }

    playOneShotAudio(buffer) {
        if(buffer) {
            var ctx = this.audioContext;
            var source = ctx.createBufferSource();
            source.buffer = buffer;
            var gain = ctx.createGain();
            gain.gain.value = 1;
            source.connect(gain).connect(ctx.destination);
            source.addEventListener("ended", e => {
                source.disconnect();
            });
            source.start(0);
        }
    }

    setupDefaultDebugLines() {
        var acLog = new LogLine("AudioContext");
        acLog.badge.text = "AudioContext";
        acLog.persistent = true;
        
        var resLog = new LogLine("Resolution");
        resLog.badge.text = "Renderer";
        resLog.persistent = true;

        var fpsLog = new LogLine("FPS");
        fpsLog.badge.text = "Renderer";
        fpsLog.persistent = true;

        var fpsWarning = new LogLine("FPS is lower than 20 on your browser. Consider switching to low resolution mode in debug menu.");
        fpsWarning.badge.text = "Renderer";
        fpsWarning.badge.background = "#f50";
        fpsWarning.hidden = true;
        fpsWarning.persistent = true;

        this.defaultLines = {
            acLog, resLog, fpsLog, fpsWarning
        };

        Object.keys(this.defaultLines).forEach(k => {
            this.debugLines.push(this.defaultLines[k]);
        });
    }

    update() {
        window.requestAnimationFrame(() => {
            this.update();
        });

        var deltaTime = performance.now() - this.lastRenderTime;
        if(deltaTime < 1000 / this.maxFPS) return;
        this.lastRenderTime = performance.now();
        
        if(this.audioCompatMode) {
            this.playbackTime = this.audioElem.currentTime + 0.016;
        } else {
            if(this.isPlaying) {
                this.playbackTime += deltaTime / 1000 * this.audioElem.playbackRate;
            }
        }
        this.gainNode.gain.value = this.audioElem.volume;
        this.currentTick = this.tickTimeMap.findIndex(t => t >= this.playbackTime * 1000);

        this._renderReset();
        this._renderBack();
        this._renderNotes();
        this._renderUI();

        if(this.enableDebugLog) {
            this._renderDebug(deltaTime);
        }

        var removalObjectsIdx = [];
        this.animatedObjects.forEach((obj, i) => {
            obj.update(this);
            if(obj.isFinished) removalObjectsIdx.push(i);
        });
        removalObjectsIdx.reverse().forEach(i => {
            this.animatedObjects.splice(i, 1);
        });
    }

    /**
     * @param {Page} page
     * @param {number} tick
     */
    getYPosition(page, tick) {
        var ch = this.canvas.height;
        var yPerTick = this.fieldHeight / page.getTickLength();
        var pos = (tick - page.startTick) * yPerTick;

        var bottomY = ch / 2 + this.fieldHeight / 2;
        var topY = ch - bottomY;

        bottomY += ch * 0.015;
        topY += ch * 0.015;
        if(page.scanLineDirection == 1) {
            return bottomY - pos;
        } else {
            return topY + pos;
        }
    }

    getPage(tick) {
        return this.chart.pages.find(p => p.endTick >= tick);
    }

    getPageIndex(tick) {
        return this.chart.pages.findIndex(p => p.endTick >= tick);
    }

    _renderBack() {
        var canvas = this.canvas;
        var ctx = this.context;
        var background = this.background;
        if(background) {
            var sc = canvas.width / background.width;
            ctx.drawImage(background, 0, (canvas.height - (background.height * sc)) / 2, canvas.width, background.height * sc);
        }

        var icon = this.icon;
        if(icon) {
            var size = canvas.height / 2;
            ctx.globalAlpha = 0.1;
            ctx.drawImage(icon, canvas.width - size / 4 * 3, canvas.height - size / 4 * 3, size, size);
        }

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
    }

    _renderNotes() {
        var canvas = this.canvas;
        var ctx = this.context;

        var ch = canvas.height;

        // Top & bottom dash lines
        var ctxt = ctx.getTransform();

        ctx.globalAlpha = 0.5;
        var bottomY = ch / 2 + this.fieldHeight / 2;
        var topY = ch - bottomY;

        bottomY += ch * 0.015;
        topY += ch * 0.015;

        ctx.strokeStyle = "#fff";
        ctx.setLineDash([5 * this.ratio, 120 * this.ratio]);

        ctx.translate(-(performance.now() % 1500) / 1500 * 125 * this.ratio, 0);
        ctx.lineWidth = 5 * this.ratio;
        // if(this.getDirection(time) == 1) ctx.lineWidth += (Math.pow(1 - rbp, 10) * 10) * this.ratio;
        ctx.beginPath();
        ctx.moveTo(-50 * this.ratio, topY);
        ctx.lineTo(canvas.width + 50 * this.ratio, topY);
        ctx.stroke();

        ctx.setTransform(ctxt);
        ctx.translate((performance.now() % 1500) / 1500 * 125 * this.ratio, 0);
        ctx.lineWidth = 5 * this.ratio;
        // if(this.getDirection(time) == -1) ctx.lineWidth += (Math.pow(1 - rbp, 10) * 10) * this.ratio;
        ctx.beginPath();
        ctx.moveTo(-50 * this.ratio, bottomY);
        ctx.lineTo(canvas.width + 50 * this.ratio, bottomY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();

        ctx.setTransform(ctxt);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 0;

        if(this.chart) {
            var notes = this.chart.notes;

            for(var i = notes.length - 1; i >= 0; i--) {
                var note = notes[i];
                if(note instanceof SliderNote) {
                    var endTime = note.getEndTick();
                    var prevPage = game.chart.pages[note.pageIndex - 1];
                    var startTick = prevPage ? prevPage.startTick : 0;
    
                    if(game.currentTick > startTick && game.currentTick < endTime) {
                        note.drawDashedPath(game);
                    }
                }
            }

            for(var i = notes.length - 1; i >= 0; i--) {
                notes[i].update(this);
            }
        }
    }

    _renderUI() {
        var canvas = this.canvas;
        var ctx = this.context;
        
        var grd = ctx.createLinearGradient(0, 0, 0, canvas.height / 6);
        grd.addColorStop(0, "black");
        grd.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        var font1 = "Rajdhani, 'Noto Sans CJK TC'";
        var font2 = "Electronize, 'Noto Sans CJK TC'";

        this._renderMusicChartInfo();

        // Play bar.
        var audioProgress = this.playbackTime / this.audioElem.duration;
        ctx.fillStyle = this.themeColor;
        ctx.fillRect(0, 0, canvas.width * audioProgress, 6 * this.ratio);
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowOffsetY = this.ratio * 2;
        ctx.fillRect(canvas.width * audioProgress - 5 * this.ratio, 0, 10 * this.ratio, 6 * this.ratio);

        ctx.globalAlpha = 0.1;
        ctx.shadowColor = ctx.fillStyle = "#fff";
        ctx.fillRect(canvas.width * audioProgress - 2.5 * this.ratio, 0, 5 * this.ratio, 6 * this.ratio);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        this._renderScanline();

        var drawText = (txt, space, y, s) => {
            var width = space * (txt.length - 1);
            var anchor = 65 * this.ratio;
            y -= anchor;
            for(var i=0; i<txt.length; i++) {
                var c = txt[i];
                var x = canvas.width / 2 - width / 2 + space * i;
                x -= canvas.width / 2;

                var t = ctx.getTransform();
                ctx.translate(canvas.width / 2, anchor);
                ctx.scale(s, s);
                ctx.fillText(c, x, y);
                ctx.setTransform(t);
            }
        }

        var lastClearTime = -5000;
        var count = 0;
        if(this.chart) {
            this.chart.notes.forEach(n => {
                if(n instanceof LongHoldNote || n instanceof HoldNote) {
                    var endTick = n.getEndTick();
                    if(this.currentTick > endTick) {
                        lastClearTime = this.tickTimeMap[endTick];
                        count++;
                    }
                } else {
                    if(this.currentTick > n.tick) {
                        lastClearTime = this.tickTimeMap[n.tick];
                        count++;
                    }
                }
            });
        }

        var time = this.playbackTime * 1000;
        var comboScale = (1 - Math.pow(Math.min(Math.max((time - lastClearTime) / 200, 0), 1), 1 / 5)) / 4.5 + 1;

        ctx.textAlign = "center";
        ctx.font = `700 ${70 * this.ratio}px ${font1}`;
        ctx.fillStyle = "#fff59d";
        drawText(count + "", 45 * this.ratio, 45 * this.ratio, comboScale);
        ctx.font = `500 ${30 * this.ratio}px ${font1}`;
        ctx.fillStyle = "#fff";
        drawText("COMBO", 23 * this.ratio, 85 * this.ratio, comboScale);
        ctx.textAlign = "left";

        this._renderAnalyser();

        var maxCombo = this.chart ? this.chart.notes.length : 0;
        var score = (n => {
            if(n == 0) return "000000";
            var d = Math.log10(n + 1);
            var r = "";
            for(var i=0; i < 5 - d; i++) {
                r += "0";
            }
            return r + n;
        })((() => {
            var s = 0;
            if(!this.chart) return 0;
            var N = this.chart.notes.length;
            this.chart.notes.forEach((_, i) => {
                if(i < count)
                s += 900000 / N + 200000 / (N * (N - 1)) * i;
            });
            return Math.round(s);
        })());

        ctx.textBaseline = "alphabetic";
        ctx.font = "700 " + (40 * this.ratio) + "px " + font1;
        ctx.fillStyle = "white";
        ctx.shadowColor = ctx.fillStyle;
        ctx.textAlign = "center";
        var sc = (1 - Math.pow(Math.min(Math.max((time - lastClearTime) / 200, 0), 1), 1 / 2.5)) / 2.5 + 1;

        score.split("").reverse().forEach((c, i) => {
            var d = Math.log10(parseInt(score) + 1);
            var s = 6 - d < (6 - i) ? Math.pow(sc, 1 / 1.5): 0.75;
            var x = canvas.width - (45 + i * 25) * this.ratio;
            var y = 55 * this.ratio;
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.fillText(c, 0, -(s - 1) * this.ratio * 3);
            ctx.scale(1 / s, 1 / s);
            ctx.translate(-x, -y);
        });

        if(this.lastScore < score && score == 1000000) {
            this.playMMEffect();
        }

        this.lastScore = parseInt(score);
    }

    _renderScanline(alpha) {
        var canvas = this.canvas;
        var ctx = this.context;

        if(this.chart) {
            if(alpha == null) alpha = 1;

            var mutatingTicks = this.chart.pages[0].getTickLength() / 3 * 2;
            var sample = 100;

            var mutateProgress = Math.max(0, mutatingTicks - this.currentTick) / mutatingTicks;
            var page = this.getPage(this.currentTick);
            var y = this.getYPosition(page, this.currentTick);

            ctx.globalAlpha = alpha;
            if(mutateProgress > 0) {
                var amount = mutateProgress * 20 * this.ratio;
                var width = canvas.width * (1 - mutateProgress);
                var startX = canvas.width * mutateProgress / 2;
                y = canvas.height / 2 - (canvas.height / 2 - y) * (1 - mutateProgress);

                ctx.lineWidth = 3 * this.ratio;
                ctx.strokeStyle = "#fff";
                ctx.beginPath();
                ctx.moveTo(startX, y);
                for(var i=1; i<=sample; i++) {
                    var yOffset = amount * Math.random() - 1;
                    ctx.lineTo(startX + width / sample * i, y + yOffset);
                }
                ctx.stroke();
                ctx.lineWidth = 0;
            } else {
                ctx.fillRect(0, y - 1.5 * this.ratio, canvas.width, 3 * this.ratio);
            }

            this.chart.eventOrders.forEach(e => {
                e.render(this);
            });
        }

        ctx.globalAlpha = 1;
    }

    _renderMusicChartInfo() {
        var canvas = this.canvas;
        var ctx = this.context;
        canvas.style.letterSpacing = "0px";

        var font1 = "Rajdhani, 'Noto Sans CJK TC'";
        var font2 = "Electronize, 'Noto Sans CJK TC'";

        // Song title
        ctx.globalAlpha = 0.2;
        var icon = this.icon;
        if(icon) {
            var size = 65 * this.ratio;
            ctx.drawImage(icon, 40 * this.ratio, canvas.height - 90 * this.ratio, size, size);
        }
        ctx.fillStyle = "white";
        ctx.font = `700 ${30 * this.ratio}px ${font1}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(this.musicTitle, 130 * this.ratio, canvas.height - 52.5 * this.ratio);

        // Song difficulty
        ctx.font = `${30 * this.ratio}px ${font2}`;
        var diffText = this.chartDifficulty.name + " " + this.chartDifficulty.level;
        var diffColor = this.chartDifficulty.color;
        var diffBackColor = this.chartDifficulty.backColor;

        var diffWidth = ctx.measureText(diffText).width + 20 * this.ratio;
        var diffRectX = canvas.width - diffWidth - 20 * this.ratio;
        var diffRectY = canvas.height - 70 * this.ratio;

        ctx.fillStyle = diffBackColor;
        ctx.fillRect(diffRectX, diffRectY, diffWidth, 40 * this.ratio);

        ctx.globalAlpha = 1;
        ctx.fillStyle = diffColor;
        ctx.fillText(diffText, diffRectX + 10 * this.ratio, diffRectY + 22.5 * this.ratio);
    }

    _renderAnalyser() {
        var canvas = this.canvas;
        var cw = canvas.width;
        var ctx = this.context;
        var buflen = this.audioAnalyser.frequencyBinCount * 0.75;
        var buffer = new Uint8Array(buflen);
        this.audioAnalyser.getByteFrequencyData(buffer);

        var indexes = [];
        for(var i=0; i<8; i++) {
            indexes.push(Math.floor(buflen / 8 * i));
        }

        var distance = 100;

        (() => {
            ctx.translate(cw / 2, 0);
            var stroke = ctx.strokeStyle;
            ctx.strokeStyle = "#fff";
            ctx.beginPath();
            indexes.reverse().forEach((i, o) => {
                var y = (18 + o * 10) * this.ratio;
                ctx.moveTo(distance * this.ratio, y);
                ctx.lineTo(5 * this.ratio + (distance + Math.pow(buffer[i] / 255, 1.5) * 150) * this.ratio, y);
                ctx.moveTo(-distance * this.ratio, y);
                ctx.lineTo(-5 * this.ratio + (distance + Math.pow(buffer[i] / 255, 1.5) * 150) * -this.ratio, y);
            });
            ctx.setLineDash([5 * this.ratio, 10 * this.ratio]);
            ctx.lineWidth = 2 * this.ratio;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = stroke;
            ctx.translate(-cw / 2, 0);
        })();
    }

    _renderDebug(deltaTime) {
        var ctx = this.context;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";

        var preferredFont = Assets.preferredFont;

        var removalLines = [];
        var pn = performance.now();
        var counter = 0;
        var persistentCount = 0;
        var persistentRenderCount = 0;
        this.debugLines.forEach(l => (l.persistent && !l.hidden) ? persistentCount++ : 0);
        
        this.defaultLines.resLog.content = `Resolution: ${this.canvas.width}x${this.canvas.height} @ ${Math.round(this.ratio*10)/10}x`;
        this.defaultLines.fpsLog.content = "FPS: " + (Math.round(100000 / deltaTime) / 100);

        K.Arrays.reversedCopy(this.debugLines).forEach((line, i) => {
            if(!line.createdTime) {
                line.createdTime = performance.now();
            }

            ctx.globalAlpha = Math.sqrt(Math.max((pn - line.createdTime) / 100, 0));

            if((!line.persistent ? persistentCount - persistentRenderCount : 0) + counter >= this.debugLogCount || line.hidden) {
                if(!line.fadedTime) {
                    line.fadedTime = performance.now() + 100;
                }
                ctx.globalAlpha = K.Maths.lerp(0, ctx.globalAlpha, Math.max((line.fadedTime - pn) / 100, 0));
            } else {
                counter++;
                if(!!line.fadedTime) {
                    line.fadedTime = null;
                    line.createdTime = performance.now();
                }
                if(line.persistent) persistentRenderCount++;
            }

            var targetY = canvas.height - counter * 35;
            line.y = K.Maths.lerp(line.y || targetY + 30, targetY, Math.min(1, deltaTime / 100));

            if(line.fadedTime != null && pn - line.fadedTime > 500 && !line.persistent) {
                removalLines.push(this.logLines.length - 1 - i);
            } 

            if(this.enableDebugLog && line.y > -100) {
                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                ctx.font = "600 18px " + preferredFont;
                var badgeWidth = ctx.measureText(line.badge.text).width;
                ctx.font = "600 19px " + preferredFont;
                var contentWidth = ctx.measureText(line.content).width;
                ctx.fillRect(0, line.y, contentWidth + 32 + badgeWidth + 10, 30);

                ctx.fillStyle = line.badge.background;
                ctx.fillRect(10, line.y + 3, badgeWidth + 16, 26);
                ctx.fillStyle = line.badge.color;
                ctx.fillText(line.badge.text, 16, line.y + 17);

                ctx.fillStyle = "white";
                ctx.font = "600 19px " + preferredFont;
                ctx.fillText(line.content, 32 + badgeWidth, line.y + 17);
            }
            ctx.globalAlpha = 1;
        });

        removalLines.forEach(l => {
            this.removeLogLine(null, l);
        });

        ctx.textBaseline = "alphabetic";
    }

    _renderReset() {
        var ctx = this.context;
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.lineWidth = 0;
        ctx.textBaseline = "bottom";
    }
}