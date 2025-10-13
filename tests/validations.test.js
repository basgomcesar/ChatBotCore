/**
 * Unit tests for validation utilities
 * Run with: node tests/validations.test.js
 */

const { isValidName, isValidMenuOption, isNumeric, detectUserType } = require('../utils/validations');
const { USUARIOS } = require('../config/constants');

// Simple test framework
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✅ PASSED: ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ FAILED: ${testName}`);
    testsFailed++;
  }
}

// Test isValidName
console.log('\n=== Testing isValidName ===');
assert(isValidName('Juan'), 'Should accept simple name');
assert(isValidName('María José'), 'Should accept name with space');
assert(isValidName('José María'), 'Should accept Spanish name');
assert(!isValidName('J'), 'Should reject single character');
assert(!isValidName('123'), 'Should reject numbers');
assert(!isValidName(''), 'Should reject empty string');
assert(!isValidName(null), 'Should reject null');

// Test isValidMenuOption
console.log('\n=== Testing isValidMenuOption ===');
assert(isValidMenuOption('1', 1, 6), 'Should accept valid option 1');
assert(isValidMenuOption('6', 1, 6), 'Should accept valid option 6');
assert(!isValidMenuOption('0', 1, 6), 'Should reject option below range');
assert(!isValidMenuOption('7', 1, 6), 'Should reject option above range');
assert(!isValidMenuOption('abc', 1, 6), 'Should reject non-numeric input');

// Test isNumeric
console.log('\n=== Testing isNumeric ===');
assert(isNumeric('123'), 'Should accept numeric string');
assert(isNumeric('0'), 'Should accept zero');
assert(!isNumeric('12.3'), 'Should reject decimal');
assert(!isNumeric('abc'), 'Should reject letters');
assert(!isNumeric(''), 'Should reject empty string');
assert(!isNumeric(null), 'Should reject null');

// Test detectUserType
console.log('\n=== Testing detectUserType ===');
assert(detectUserType('1') === USUARIOS.ACTIVO, 'Should detect option 1 as ACTIVO');
assert(detectUserType('2') === USUARIOS.PENSIONADO, 'Should detect option 2 as PENSIONADO');
assert(detectUserType('activo') === USUARIOS.ACTIVO, 'Should detect "activo" keyword');
assert(detectUserType('pensionado') === USUARIOS.PENSIONADO, 'Should detect "pensionado" keyword');
assert(detectUserType('pensionista') === USUARIOS.PENSIONADO, 'Should detect "pensionista" keyword');
assert(detectUserType('jubilado') === USUARIOS.PENSIONADO, 'Should detect "jubilado" keyword');
assert(detectUserType('xyz') === null, 'Should return null for invalid input');

// Summary
console.log('\n=== Test Summary ===');
console.log(`Total tests: ${testsPassed + testsFailed}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed');
  process.exit(1);
}
