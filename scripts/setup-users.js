const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: 8090, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // 1. Auth as superuser
  const auth = await request('POST', '/api/superusers/auth-with-password', {
    identity: 'admin@fungimap.lab',
    password: 'admin123456'
  });
  
  if (!auth.data.token) {
    console.error('Auth failed:', JSON.stringify(auth));
    process.exit(1);
  }
  const token = auth.data.token;
  console.log('✅ Auth OK');

  // 2. Get users collection
  const colRes = await request('GET', '/api/collections/users', null);
  if (!colRes.data.fields) {
    console.error('Get collection failed:', JSON.stringify(colRes));
    process.exit(1);
  }
  
  const col = colRes.data;
  const fieldNames = col.fields.map(f => f.name);
  console.log('Current fields:', fieldNames.join(', '));

  // 3. Add missing fields
  if (!fieldNames.includes('name')) {
    col.fields.push({
      name: 'name', type: 'text', required: false,
      options: { min: null, max: null, pattern: '' }
    });
    console.log('  + adding name');
  }
  if (!fieldNames.includes('role')) {
    col.fields.push({
      name: 'role', type: 'select', required: false,
      options: { maxSelect: 1, values: ['user', 'expert', 'admin'] }
    });
    console.log('  + adding role');
  }
  if (!fieldNames.includes('points')) {
    col.fields.push({
      name: 'points', type: 'number', required: false,
      options: { min: null, max: null }
    });
    console.log('  + adding points');
  }
  if (!fieldNames.includes('merits')) {
    col.fields.push({
      name: 'merits', type: 'select', required: false,
      options: { maxSelect: 20, values: [] }
    });
    console.log('  + adding merits');
  }
  if (!fieldNames.includes('avatar')) {
    col.fields.push({
      name: 'avatar', type: 'file', required: false,
      options: { maxSelect: 1, maxSize: 2097152, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }
    });
    console.log('  + adding avatar');
  }
  if (!fieldNames.includes('last_lat')) {
    col.fields.push({
      name: 'last_lat', type: 'number', required: false,
      options: { min: null, max: null }
    });
    console.log('  + adding last_lat');
  }
  if (!fieldNames.includes('last_lng')) {
    col.fields.push({
      name: 'last_lng', type: 'number', required: false,
      options: { min: null, max: null }
    });
    console.log('  + adding last_lng');
  }
  if (!fieldNames.includes('last_seen')) {
    col.fields.push({
      name: 'last_seen', type: 'date', required: false,
      options: { min: '', max: '' }
    });
    console.log('  + adding last_seen');
  }

  // 4. Update collection
  const updateOpts = {
    hostname: '127.0.0.1', port: 8090,
    path: '/api/collections/users',
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    }
  };

  const updateReq = http.request(updateOpts, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('✅ Collection updated successfully');
        
        // 5. List users
        request('GET', '/api/collections/users/records', null)
          .then(r => {
            console.log(`Users: ${r.data.totalItems || 0} registered`);
            if (r.data.items) {
              r.data.items.forEach(u => console.log(`  - ${u.email} (role: ${u.role || 'none'})`));
            }
          });
      } else {
        console.error('Update failed:', res.statusCode, data);
      }
    });
  });
  updateReq.write(JSON.stringify(col));
  updateReq.end();
}

main().catch(console.error);
