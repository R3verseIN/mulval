#!/usr/bin/env python3
import json
import lzma
import urllib.request
import pymysql
import datetime
import concurrent.futures

# Global connection config
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'root',
    'database': 'nvd',
    'autocommit': True
}

def setup_db():
    connection = pymysql.connect(**DB_CONFIG)
    with connection.cursor() as cursor:
        print("[*] Setting up NVD database schema...", flush=True)
        cursor.execute("DROP TABLE IF EXISTS nvd")
        schema = """
        CREATE TABLE nvd (
            id VARCHAR(30) NOT NULL,
            soft VARCHAR(160) NOT NULL DEFAULT 'undefined',
            rng VARCHAR(100) NOT NULL DEFAULT 'undefined',
            lose_types VARCHAR(100) NOT NULL DEFAULT 'undefined',
            severity VARCHAR(20) NOT NULL DEFAULT 'undefined',
            access VARCHAR(20) NOT NULL DEFAULT 'undefined'
        )
        """
        cursor.execute(schema)
    connection.close()

def process_cve(item):
    cve_id = item.get("id", "")
    
    # Defaults
    sftw = "undefined"
    rge = "undefined"
    lose_types = ""
    sev = "undefined"
    access = "undefined"

    # 1. Parse Software (CPE)
    try:
        for conf in item.get("configurations", []):
            for node in conf.get("nodes", []):
                for cpeMatch in node.get("cpeMatch", []):
                    if cpeMatch.get("vulnerable", False):
                        cpe23Uri = cpeMatch.get("criteria", "")
                        parts = cpe23Uri.split(":")
                        if len(parts) >= 5:
                            sftw = f"{parts[3]}:{parts[4]}"
                        break
                if sftw != "undefined": break
            if sftw != "undefined": break
    except Exception:
        pass

    # 2. Parse Metrics
    metrics = item.get("metrics", {})
    cvss = None
    if "cvssMetricV2" in metrics:
        cvss = metrics["cvssMetricV2"][0]["cvssData"]
        sev = cvss.get("baseSeverity", "undefined")
        
        ac = cvss.get("accessComplexity", "undefined")
        if ac == "LOW": access = "l"
        elif ac == "MEDIUM": access = "m"
        elif ac == "HIGH": access = "h"

        av = cvss.get("accessVector", "undefined")
        if av == "NETWORK": rge = "'remoteExploit'"
        elif av == "ADJACENT_NETWORK": rge = "'lan'"
        elif av == "LOCAL": rge = "'localExploit'"

        # lose_types (Confidentiality, Integrity, Availability)
        losses = []
        if cvss.get("availabilityImpact") in ["PARTIAL", "COMPLETE"]:
            losses.append("'availability_loss'")
        if cvss.get("confidentialityImpact") in ["PARTIAL", "COMPLETE"]:
            losses.append("'data_loss'")
        if cvss.get("integrityImpact") in ["PARTIAL", "COMPLETE"]:
            losses.append("'data_modification'")
        
        # MulVAL rules specifically look for 'privEscalation' to grant execCode
        if "COMPLETE" in [cvss.get("confidentialityImpact"), cvss.get("integrityImpact"), cvss.get("availabilityImpact")]:
            losses.append("'privEscalation'")
        
        lose_types = ",".join(losses) if losses else "'other'"

    elif "cvssMetricV31" in metrics or "cvssMetricV30" in metrics:
        v3_key = "cvssMetricV31" if "cvssMetricV31" in metrics else "cvssMetricV30"
        cvss = metrics[v3_key][0]["cvssData"]
        sev = cvss.get("baseSeverity", "undefined")
        
        ac = cvss.get("attackComplexity", "undefined")
        if ac == "LOW": access = "l"
        elif ac == "HIGH": access = "h"

        av = cvss.get("attackVector", "undefined")
        if av == "NETWORK": rge = "'remoteExploit'"
        elif av == "ADJACENT_NETWORK": rge = "'lan'"
        elif av == "LOCAL": rge = "'localExploit'"
        elif av == "PHYSICAL": rge = "'localExploit'"

        losses = []
        if cvss.get("availabilityImpact") in ["LOW", "HIGH"]:
            losses.append("'availability_loss'")
        if cvss.get("confidentialityImpact") in ["LOW", "HIGH"]:
            losses.append("'data_loss'")
        if cvss.get("integrityImpact") in ["LOW", "HIGH"]:
            losses.append("'data_modification'")

        # Map high impact to privEscalation
        if "HIGH" in [cvss.get("confidentialityImpact"), cvss.get("integrityImpact"), cvss.get("availabilityImpact")]:
            losses.append("'privEscalation'")
        
        lose_types = ",".join(losses) if losses else "'other'"
            
    sftw = sftw.replace("'", "''")
    return (cve_id, sftw, rge, lose_types, sev, access)

def sync_year(year):
    url = f"https://github.com/fkie-cad/nvd-json-data-feeds/releases/latest/download/CVE-{year}.json.xz"
    print(f"[*] Fetching NVD data for {year}...", flush=True)
    try:
        response = urllib.request.urlopen(url)
        decompressed_data = lzma.decompress(response.read())
        json_data = json.loads(decompressed_data)
        
        cve_items = json_data.get("cve_items", [])
        batch = [process_cve(item) for item in cve_items]
        
        if batch:
            # Open thread-safe connection for this year
            connection = pymysql.connect(**DB_CONFIG)
            with connection.cursor() as cursor:
                sql = "INSERT INTO nvd (id, soft, rng, lose_types, severity, access) VALUES (%s, %s, %s, %s, %s, %s)"
                cursor.executemany(sql, batch)
            connection.close()
            
        print(f"    -> Inserted {len(cve_items)} records for {year}.", flush=True)
    except Exception as e:
        print(f"    -> Failed for {year}: {e}", flush=True)

def main():
    setup_db()
    current_year = datetime.datetime.now().year
    years = list(range(2002, current_year + 1))
    
    # Use ThreadPoolExecutor to run downloads and inserts concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        executor.map(sync_year, years)
        
    print("[*] NVD Sync Complete!", flush=True)

if __name__ == "__main__":
    main()
