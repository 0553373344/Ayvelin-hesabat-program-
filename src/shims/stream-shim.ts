export class Readable {
  static Readable = Readable;
  _read() {}
}

export class Writable {
  static Writable = Writable;
  _write() {}
}

export class Duplex {
  static Duplex = Duplex;
}

export class Transform {
  static Transform = Transform;
}

export default {
  Readable,
  Writable,
  Duplex,
  Transform
};
