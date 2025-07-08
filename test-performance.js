#!/usr/bin/env node

/**
 * Performance Test Script for LeadEstate Agency Backend
 * Tests the optimized dashboard endpoint and database performance
 */

const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'https://leadestate-backend-9fih.onrender.com';
const ENDPOINTS = {
  optimized: '/api/dashboard/all-data',
  individual: {
    leads: '/api/leads',
    properties: '/api/properties',
    team: '/api/team'
  },
  optimize: '/api/optimize-db'
};

console.log('🚀 LeadEstate Performance Test Suite');
console.log('=====================================');
console.log(`Testing API: ${API_URL}`);
console.log('');

// Test function with timing
async function testEndpoint(name, url, description) {
  try {
    console.log(`🧪 Testing ${name}...`);
    const startTime = Date.now();
    
    const response = await axios.get(`${API_URL}${url}`, {
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const success = response.status === 200 && response.data.success;
    const dataCount = response.data.count || response.data.data?.length || 0;
    
    console.log(`${success ? '✅' : '❌'} ${name}: ${duration}ms`);
    console.log(`   ${description}`);
    console.log(`   Status: ${response.status}, Data: ${JSON.stringify(dataCount)}`);
    
    if (response.data.performance) {
      console.log(`   Query Time: ${response.data.performance.queryTime}ms`);
    }
    
    console.log('');
    
    return { success, duration, dataCount };
  } catch (error) {
    console.log(`❌ ${name}: FAILED`);
    console.log(`   Error: ${error.message}`);
    console.log('');
    return { success: false, duration: null, error: error.message };
  }
}

// Test individual endpoints (old method)
async function testIndividualEndpoints() {
  console.log('📊 Testing Individual Endpoints (Old Method)');
  console.log('--------------------------------------------');
  
  const startTime = Date.now();
  const results = [];
  
  for (const [name, url] of Object.entries(ENDPOINTS.individual)) {
    const result = await testEndpoint(name, url, `Individual ${name} endpoint`);
    results.push(result);
  }
  
  const totalTime = Date.now() - startTime;
  const allSuccess = results.every(r => r.success);
  
  console.log(`📈 Individual Endpoints Summary:`);
  console.log(`   Total Time: ${totalTime}ms`);
  console.log(`   Success Rate: ${results.filter(r => r.success).length}/${results.length}`);
  console.log(`   Status: ${allSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  return { totalTime, success: allSuccess, results };
}

// Test optimized endpoint (new method)
async function testOptimizedEndpoint() {
  console.log('⚡ Testing Optimized Endpoint (New Method)');
  console.log('------------------------------------------');
  
  const result = await testEndpoint(
    'Optimized Dashboard', 
    ENDPOINTS.optimized, 
    'Single endpoint for all dashboard data'
  );
  
  console.log(`📈 Optimized Endpoint Summary:`);
  console.log(`   Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  return result;
}

// Test database optimization
async function testDatabaseOptimization() {
  console.log('🗄️ Testing Database Optimization');
  console.log('--------------------------------');
  
  const result = await testEndpoint(
    'Database Optimization', 
    ENDPOINTS.optimize, 
    'Create database indexes for better performance'
  );
  
  console.log(`📈 Database Optimization Summary:`);
  console.log(`   Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  return result;
}

// Main test runner
async function runPerformanceTests() {
  try {
    console.log(`⏰ Starting tests at ${new Date().toISOString()}`);
    console.log('');
    
    // Test database optimization first
    const dbOptResult = await testDatabaseOptimization();
    
    // Test individual endpoints (baseline)
    const individualResult = await testIndividualEndpoints();
    
    // Test optimized endpoint
    const optimizedResult = await testOptimizedEndpoint();
    
    // Performance comparison
    console.log('🏆 Performance Comparison');
    console.log('=========================');
    
    if (individualResult.success && optimizedResult.success) {
      const improvement = individualResult.totalTime - optimizedResult.duration;
      const improvementPercent = Math.round((improvement / individualResult.totalTime) * 100);
      
      console.log(`Individual Endpoints: ${individualResult.totalTime}ms`);
      console.log(`Optimized Endpoint:   ${optimizedResult.duration}ms`);
      console.log(`Improvement:          ${improvement}ms (${improvementPercent}%)`);
      console.log('');
      
      if (improvementPercent > 50) {
        console.log('🎉 EXCELLENT: Performance improved by more than 50%!');
      } else if (improvementPercent > 20) {
        console.log('✅ GOOD: Performance improved by more than 20%');
      } else if (improvementPercent > 0) {
        console.log('👍 OK: Some performance improvement detected');
      } else {
        console.log('⚠️ WARNING: No significant performance improvement');
      }
    } else {
      console.log('❌ Cannot compare performance - some tests failed');
    }
    
    console.log('');
    console.log('📋 Test Summary');
    console.log('===============');
    console.log(`Database Optimization: ${dbOptResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Individual Endpoints:  ${individualResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Optimized Endpoint:    ${optimizedResult.success ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = dbOptResult.success && individualResult.success && optimizedResult.success;
    console.log(`Overall Status:        ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
  } catch (error) {
    console.error('💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runPerformanceTests();
