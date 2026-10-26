"""Collection transport regression: real UI, synthetic data, no providers or auth."""
import hashlib, json, os, socket, subprocess, sys, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(os.getenv('MEME_LAB_TEST_ROOT', Path(__file__).resolve().parents[1]))
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'work/collection-loading')
OUT.mkdir(parents=True, exist_ok=True)
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
proc = subprocess.Popen(['node', 'scripts/preview-landing.mjs', str(port)], cwd=ROOT,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
base = f'http://127.0.0.1:{port}'
rows = [{'id': 'synthetic-'+str(i), 'name': 'Synthetic waiting '+str(i),
         'message': 'A fictional reaction fixture.', 'relational_pattern': 'waiting',
         'tags': ['waiting', 'synthetic'], 'availability': 'live', 'media_type': 'image',
         'image_url': 'https://fixture.test/synthetic-image.svg'} for i in range(24)]
model = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import fs from 'node:fs';import {compileCatalogue} from './src/catalogue-model.mjs';process.stdout.write(JSON.stringify(compileCatalogue(JSON.parse(fs.readFileSync(0,'utf8')))));"
], cwd=ROOT, input=json.dumps(rows).encode()))
report = []
try:
    for _ in range(100):
        try:
            if proc.poll() is not None: raise RuntimeError('Owned preview exited')
            urlopen(base+'/collection').close()
            break
        except Exception:
            time.sleep(.1)
    html = urlopen(base+'/collection').read()
    assert html == (ROOT/'worker/public/collection.html').read_bytes(), 'Preview source identity mismatch'
    (OUT/'source.json').write_text(json.dumps({
        'revision': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'hashes': {name: hashlib.sha256((ROOT/'worker/public'/name).read_bytes()).hexdigest()
                   for name in ['collection.html','collection.js','collection.css','app.css']},
        'network': {'latency_ms':562.5,'download_bytes_per_second':180000,'upload_bytes_per_second':84375,'cpu_rate':4,'cache':'disabled'},
        'scope':'Local Worker handler and production source; synthetic catalogue transport; no provider or private account'
    },indent=2))
    with sync_playwright() as p:
        executable = os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
        launch = {'executable_path': executable} if executable else ({'channel': 'chrome'} if sys.platform == 'darwin' else {'executable_path': '/usr/bin/chromium'})
        browser = p.chromium.launch(**launch, args=['--no-sandbox'])
        for width in [390, 768, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 900},
                                          service_workers='block', color_scheme='dark')
            page = context.new_page()
            errors = []
            pending = []
            fallback = {'invalid': False}
            navigation = {}
            page.on('pageerror', lambda error: errors.append(str(error)))
            context.route_web_socket('**/*', lambda socket: socket.close())
            cdp = context.new_cdp_session(page)
            cdp.send('Network.enable')
            cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
            def request_started(event):
                if event.get('type') == 'Document':
                    navigation.update(id=event['requestId'], start=event['timestamp'])
                    navigation.pop('first_body_ms', None)
            def data_received(event):
                if event['requestId'] == navigation.get('id') and 'first_body_ms' not in navigation:
                    navigation['first_body_ms'] = (event['timestamp'] - navigation['start']) * 1000
            cdp.on('Network.requestWillBeSent', request_started)
            cdp.on('Network.dataReceived', data_received)
            cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 562.5,
                     'downloadThroughput': 1.6*1000*1000/8*.9, 'uploadThroughput': 750*1000/8*.9,
                     'connectionType': 'cellular4g'})
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
            context.add_init_script("""window.auditShifts=[];window.auditRelease=Infinity;
                new PerformanceObserver(list=>window.auditShifts.push(...list.getEntries()
                .map(e=>({t:e.startTime,value:e.value,recent:e.hadRecentInput}))))
                .observe({type:'layout-shift',buffered:true});""")
            def transport(route):
                url = route.request.url
                if url.endswith('/synthetic-image.svg'):
                    route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#24334c"/></svg>')
                elif not url.startswith(base+'/'):
                    route.abort()
                elif url.endswith('/catalogue-v2.json'):
                    pending.append(route)
                elif url.endswith('/collection.json'):
                    route.fulfill(status=200 if fallback['invalid'] else 503, json={'invalid': 'collection'})
                elif '/api/' in url:
                    route.fulfill(status=503, json={'error': 'Unseeded local test operation'})
                else:
                    route.continue_()
            context.route('**/*', transport)
            page.goto(base+'/collection?collection=all')
            page.wait_for_function('() => document.querySelector("#collection-grid").getAttribute("aria-busy")==="true"')
            assert page.locator('.collection-skeleton').count() == 24
            assert page.locator('#collection-error').is_hidden()
            assert page.locator('#collection-empty').is_hidden()
            page.locator('#catalogue-search').fill('waiting')
            page.locator('[data-mood="waiting"]').click()
            page.locator('[data-format="image"]').click()
            page.locator('#collection-sort').select_option('name')
            pending_state = page.evaluate("""() => ({skeletons:document.querySelectorAll('.collection-skeleton').length, empty:!document.querySelector('#collection-empty').hidden, count:document.querySelector('#collection-count').textContent})""")
            page.screenshot(path=str(OUT/f'pending-filters-{width}.png'), full_page=True)
            assert pending_state['skeletons'] == 24 and not pending_state['empty'], pending_state
            assert 'Loading' in pending_state['count'], pending_state
            assert page.locator('[data-mood="waiting"]').get_attribute('aria-pressed') == 'true'
            initial_timing = page.evaluate("""() => ({navigation:performance.getEntriesByType('navigation')[0].toJSON(),paint:performance.getEntriesByType('paint').map(e=>e.toJSON())})""")
            initial_timing['first_document_body_ms'] = navigation.get('first_body_ms')
            page.wait_for_timeout(600)
            page.evaluate('window.auditRelease=performance.now()')
            pending.pop().fulfill(status=503, json={'error': 'Synthetic collection failure'})
            page.locator('#collection-retry').wait_for(state='visible')
            assert page.locator('#collection-empty').is_hidden()
            assert page.locator('#collection-grid').get_attribute('aria-busy') == 'false'
            page.locator('#collection-sort').select_option('featured')
            assert page.locator('#collection-error').is_visible()
            assert page.locator('#collection-empty').is_hidden()
            assert page.locator('#collection-count').inner_text() == 'Collection unavailable'
            page.screenshot(path=str(OUT/f'error-{width}.png'), full_page=True)
            page.locator('#collection-retry').click()
            page.wait_for_function('() => document.querySelector("#collection-grid").getAttribute("aria-busy")==="true"')
            assert page.locator('#collection-retry').is_disabled()
            assert page.locator('#catalogue-search').input_value() == 'waiting'
            page.wait_for_timeout(600)
            page.evaluate('window.auditRelease=performance.now();window.auditShifts=[]')
            pending.pop().fulfill(json=model)
            page.locator('#collection-count').filter(has_text='24 memes').wait_for()
            page.wait_for_timeout(800)
            cls = page.evaluate('auditShifts.filter(e=>e.t>=auditRelease&&!e.recent).reduce((n,e)=>n+e.value,0)')
            assert cls <= .05, (width, cls)
            assert page.locator('.collection-card').count() == 24
            page.screenshot(path=str(OUT/f'populated-{width}.png'), full_page=True)
            page.locator('#catalogue-search').fill('no-such-fixture')
            page.locator('#collection-empty').wait_for(state='visible')
            assert page.locator('#collection-error').is_hidden()
            assert page.locator('#collection-count').inner_text() == '0 memes'
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.screenshot(path=str(OUT/f'empty-{width}.png'), full_page=True)
            fallback['invalid'] = True
            page.reload()
            page.wait_for_function('() => document.querySelector("#collection-grid").getAttribute("aria-busy")==="true"')
            pending.pop().fulfill(json={'invalid': 'collection'})
            page.locator('#collection-error').filter(has_text='unreadable').wait_for()
            assert page.locator('#collection-empty').is_hidden()
            assert not errors, errors
            report.append({'width': width, 'arrival_cls': cls, 'initial_timing': initial_timing,
                           'pending_filters_preserve_skeletons': True, 'failed_filters_preserve_error': True, 'retry_preserves_query': True,
                           'empty_distinct_from_error': True, 'invalid_data_is_error': True})
            for route in pending: route.abort()
            pending.clear()
            context.close()
        browser.close()
    (OUT/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report))
finally:
    proc.terminate()
    proc.wait(timeout=10)
