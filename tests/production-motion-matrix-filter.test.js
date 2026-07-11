import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrixCases } from '../scripts/production-motion-matrix-cases.mjs';

const sites=[['cf','https://cf.test'],['linux','https://linux.test']];

test('matrix dimensions can be narrowed without adding cases',()=>{
 const cases=buildMatrixCases(sites,{engines:'webkit',widths:'390,768',motions:'reduce,no-preference'});
 assert.deepEqual(cases.map(({site,engine,width,reducedMotion})=>[site,engine,width,reducedMotion]),[
  ['cf','webkit',390,'reduce'],['cf','webkit',390,'no-preference'],['cf','webkit',768,'reduce'],['cf','webkit',768,'no-preference'],
  ['linux','webkit',390,'reduce'],['linux','webkit',390,'no-preference'],['linux','webkit',768,'reduce'],['linux','webkit',768,'no-preference']
 ]);
});

test('case filter selects exact existing cases only',()=>{
 const cases=buildMatrixCases(sites,{caseFilter:'linux/webkit/390/reduce,linux/webkit/768/no-preference,linux/webkit/768/reduce'});
 assert.deepEqual(cases.map(({site,engine,width,reducedMotion})=>`${site}/${engine}/${width}/${reducedMotion}`),[
  'linux/webkit/390/reduce','linux/webkit/768/no-preference','linux/webkit/768/reduce'
 ]);
});

test('invalid dimensions and filters fail closed',()=>{
 assert.throws(()=>buildMatrixCases(sites,{engines:'firefox'}),/MATRIX_ENGINES/);
 assert.throws(()=>buildMatrixCases(sites,{widths:'391'}),/MATRIX_WIDTHS/);
 assert.throws(()=>buildMatrixCases(sites,{motions:'sometimes'}),/MATRIX_MOTIONS/);
 assert.throws(()=>buildMatrixCases(sites,{caseFilter:'linux/webkit/999/reduce'}),/MATRIX_CASE_FILTER/);
});
