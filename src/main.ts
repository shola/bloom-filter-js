export const toCharCodeArray: (str: string) => Uint8Array<ArrayBufferLike> = (
  str
) => new Uint8Array(str.split("").map((c) => c.charCodeAt(0)));

// ASSUMPTION: arrayValues is "arraylike", but can be safely represented as an array.
type HashFn = (
  arrayValues: Uint8Array<ArrayBufferLike>,
  lastHash?: number,
  lastCharCode?: number
) => number;
/**
 * Returns a function that generates a Rabin fingerprint hash function
 * @param p The prime to use as a base for the Rabin fingerprint algorithm
 */
export const simpleHashFn: (p: number) => HashFn =
  (p) => (arrayValues, lastHash, lastCharCode) => {
    return lastHash && lastCharCode
      ? // See the abracadabra example: https://en.wikipedia.org/wiki/Rabin%E2%80%93Karp_algorithm
        (lastHash - lastCharCode * Math.pow(p, arrayValues.length - 1)) * p +
          arrayValues[arrayValues.length - 1]
      : arrayValues.reduce(
          (total, x, i) => total + x * Math.pow(p, arrayValues.length - i - 1),
          0
        );
  };

/*
 * Sets the specific bit location
 */
export const setBit = (
  buffer: Uint8Array<ArrayBufferLike>,
  bitLocation: number
) => (buffer[(bitLocation / 8) | 0] |= 1 << bitLocation % 8);
type SetBitParams = Parameters<typeof setBit>;
type SetBitWithBufferBound = (
  bitLocation: SetBitParams[1]
) => ReturnType<typeof setBit>;

/**
 * Returns true if the specified bit location is set
 */
export const isBitSet = (
  buffer: Uint8Array<ArrayBufferLike>,
  bitLocation: number
) => !!(buffer[(bitLocation / 8) | 0] & (1 << bitLocation % 8));
type IsBitSetParams = Parameters<typeof isBitSet>;
type IsBitSetWithBufferBound = (
  bitLocation: IsBitSetParams[1]
) => ReturnType<typeof isBitSet>;

export class BloomFilter {
  /**
   * Constructs a new BloomFilter instance.
   * If you'd like to initialize with a specific size just call BloomFilter.from(Array.from(Uint8Array(size).values()))
   * Note that there is purposely no remove call because adding that would introduce false negatives.
   *
   * @param bitsPerElement Used along with estimatedNumberOfElements to figure out the size of the BloomFilter
   *   By using 10 bits per element you'll have roughly 1% chance of false positives.
   * @param estimatedNumberOfElements Used along with bitsPerElementto figure out the size of the BloomFilter
   * @param hashFns An array of hash functions to use. These can be custom but they should be of the form
   *   (arrayValues, lastHash, lastCharCode) where the last 2 parameters are optional and are used to make
   *   a rolling hash to save computation.
   */
  buffer: Uint8Array<ArrayBufferLike>;
  bufferBitSize: number;
  hashFns: Array<HashFn>;
  setBit: SetBitWithBufferBound;
  isBitSet: IsBitSetWithBufferBound;
  constructor(
    bitsPerElement: Uint8Array<ArrayBufferLike> | number = 10,
    estimatedNumberOfElements: Array<HashFn> | number = 50000,
    hashFns?: Array<HashFn>
  ) {
    if (
      typeof bitsPerElement === "number" &&
      typeof estimatedNumberOfElements === "number"
    ) {
      // Calculate the needed buffer size in bytes
      this.bufferBitSize = bitsPerElement * estimatedNumberOfElements;
      this.buffer = new Uint8Array(Math.ceil(this.bufferBitSize / 8));
    } else if (bitsPerElement.constructor === Uint8Array) {
      // Re-order params
      this.buffer = new Uint8Array(bitsPerElement);
      // Calculate new buffer size
      this.bufferBitSize = this.buffer.length * 8;
    } else {
      throw new Error(
        `bitsPerElement being a number and estimatedNumberOfElements being arraylike
        is invalid`
      );
    }
    this.hashFns = hashFns
      ? hashFns
      : estimatedNumberOfElements.constructor === Array
      ? estimatedNumberOfElements
      : [simpleHashFn(11), simpleHashFn(17), simpleHashFn(23)];
    this.setBit = setBit.bind(this, this.buffer);
    this.isBitSet = isBitSet.bind(this, this.buffer);
  }

  /**
   * Construct a Bloom filter from a previous array of data
   * Note that the hash functions must be the same!
   */
  static from(arrayLike: Uint8Array<ArrayBufferLike>, hashFns?: HashFn[]) {
    // TODO: find out what constructor BloomFilter is using here... how
    // are the number of args 2 instead of 3, and have different types
    // than the original first and second constructor params?
    return new BloomFilter(arrayLike, hashFns);
  }

  /**
   * Serializing the current BloomFilter into a JSON friendly format.
   * You would typically pass the result into JSON.stringify.
   * Note that BloomFilter.from only works if the hash functions are the same.
   */
  toJSON() {
    return new Uint8Array(this.buffer.values());
  }

  /**
   * Print the buffer, mostly used for debugging only
   */
  print() {
    console.log(this.buffer);
  }

  /**
   * Given a string gets all the locations to check/set in the buffer
   * for that string.
   * @param charCodes An array of the char codes to use for the hash
   * TODO: are numbers char codes?
   */
  getLocationsForCharCodes(charCodes: Uint8Array<ArrayBufferLike>) {
    return this.hashFns.map((h) => h(charCodes) % this.bufferBitSize);
  }

  /**
   * Obtains the hashes for the specified charCodes
   * See "Rabin fingerprint" in https://en.wikipedia.org/wiki/Rabin%E2%80%93Karp_algorithm for more information.
   *
   * @param charCodes An array of the char codes to use for the hash
   * @param lastHashes If specified, it will pass the last hash to the hashing
   * function for a faster computation.  Must be called with lastCharCode.
   * @param lastCharCode if specified, it will pass the last char code
   *  to the hashing function for a faster computation. Must be called with lastHashes.
   */
  getHashesForCharCodes(
    charCodes: Uint8Array<ArrayBufferLike>,
    lastHashes?: number[],
    lastCharCode?: number
  ) {
    // Originally, this code passed one too many args, so the bufferBitSize
    // wasn't actually used. I tried modding the result of a hashFn by
    /// bufferBitSize, similar to other functions, and that resulted in an
    // error. So it seems that the bufferBitSize can be safely excluded.
    return this.hashFns.map(
      (h, i) =>
        h(charCodes, lastHashes ? lastHashes[i] : undefined, lastCharCode) // %
      //        this.bufferBitSize
    );
  }

  /**
   * Adds he specified string to the set
   */
  add(data: string | Uint8Array<ArrayBufferLike>) {
    if (typeof data === "string") {
      data = toCharCodeArray(data);
    }

    this.getLocationsForCharCodes(data).forEach(this.setBit);
  }

  /**
   * Checks whether an element probably exists in the set, or definitely doesn't.
   * @param str Either a string to check for existance or an array of the string's char codes
   *   The main reason why you'd want to pass in a char code array is because passing a string
   *   will use JS directly to get the char codes which is very inneficient compared to calling
   *   into C++ code to get it and then making the call.
   *
   * Returns true if the element probably exists in the set
   * Returns false if the element definitely does not exist in the set
   */
  exists(data: string | Uint8Array<ArrayBufferLike>) {
    if (typeof data === "string") {
      data = toCharCodeArray(data);
    }
    return this.getLocationsForCharCodes(data).every(this.isBitSet);
  }

  /**
   * Checks if any substring of length substringLenght probably exists or definitely doesn't
   * If false is returned then no substring of the specified string of the specified lengthis in the bloom filter
   * @param data The substring or char array to check substrings on.
   */
  substringExists(
    data: string | Array<number> | Uint8Array<ArrayBufferLike>,
    substringLength: number
  ) {
    if (data.constructor !== Uint8Array) {
      if (typeof data === "string") {
        data = toCharCodeArray(data);
      }
      data = new Uint8Array(data);
    }

    let lastHashes: number[] | undefined, lastCharCode;
    for (let i = 0; i < data.length - substringLength + 1; i++) {
      // /this will slide over so it compares the correct strings
      // Modifying lastHashes, with lastHashes, seems funky
      lastHashes = this.getHashesForCharCodes(
        data.subarray(i, i + substringLength),
        lastHashes,
        lastCharCode
      );

      // need to find out where the isBitSet check fails and why.
      // the issue doesn't seem to be with toCharCodeArray.
      // Begs the question, are the bits being set as expected?
      if (
        lastHashes
          .map((x) => x % this.bufferBitSize)
          .every((bitLocation) => this.isBitSet(bitLocation))
      ) {
        return true;
      }
      lastCharCode = data[i];
    }
    return false;
  }
}
