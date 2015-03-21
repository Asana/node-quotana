
function Locker() {
  this._locks = {};
}

Locker.prototype.isLocked = function(id) {
  return this._locks[id] === undefined;
};

Locker.prototype.tryLock = function(id) {
  if (this._locks[id] !== undefined) {
    return false;
  }
  this._locks[id] = true;
  return true;
};

Locker.prototype.unlock = function(id) {
  delete this._locks[id];
};

module.exports = Locker;
