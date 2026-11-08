import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSeconds,deviceInfo,moduleInfo} from './usageMath.js';
test('usage time excludes hidden, unfocused and idle intervals',()=>{
 assert.equal(activeSeconds(1000,6000,1000,true,true),5);
 assert.equal(activeSeconds(1000,6000,1000,false,true),0);
 assert.equal(activeSeconds(1000,6000,1000,true,false),0);
 assert.equal(activeSeconds(65000,70000,1000,true,true),0);
 assert.equal(activeSeconds(59000,64000,1000,true,true),2);
 assert.equal(activeSeconds(0,90000,90000,true,true),5);
});
test('module telemetry omits search and record query parameters',()=>{
 assert.deepEqual(moduleInfo('#/fundRequests?tab=Requests&tab=History&search=private&account=secret'),{module:'fundRequests',section:'Requests / History'});
});
test('coarse device classification',()=>{
 assert.equal(deviceInfo('Mozilla Android Mobile Chrome/120').device,'Phone');
 assert.equal(deviceInfo('Mozilla Chrome/120 Edg/120').browser,'Edge');
 assert.equal(deviceInfo('Mozilla iPad Safari/17').device,'Tablet');
});
