/**
 * Test: Withdrawal Solver Bounds
 * Migrated from ../../test_bounds.js
 */
function testLogic() {
    const scenarios = [
        { total: 10000, retAge: 65, curAge: 65, lifeExp: 95, ss: 2000, desc: "Small portfolio, 30 years, $2K SS" },
        { total: 10000000, retAge: 85, curAge: 85, lifeExp: 90, ss: 5000, desc: "Large portfolio, 5 years, $5K SS" },
        { total: 0, retAge: 53, curAge: 53, lifeExp: 90, ss: 5000, desc: "Zero portfolio (guard)" },
        { total: 50000, retAge: 60, curAge: 60, lifeExp: 90, ss: 3500, desc: "Tiny portfolio, large SS" },
        { total: 1000000, retAge: 60, curAge: 60, lifeExp: 95, ss: 0, desc: "Medium portfolio, no SS" },
        { total: 5000000, retAge: 70, curAge: 70, lifeExp: 100, ss: 4000, desc: "Large portfolio, 30 years, $4K SS" },
    ];

    let failures = 0;
    scenarios.forEach(sc => {
        const { total, retAge, curAge, lifeExp, ss, desc } = sc;
        const years = lifeExp - retAge;
        const ssBoost = Math.round(ss || 0);
        let hi = Math.max(Math.round(total * 0.12 / 12), Math.round(total / (Math.max(years, 1) * 12) * 2)) + ssBoost;
        if (hi < 1000) hi = 10000;

        const rawMonthly = total > 0 ? total / (years * 12) : 0;

        console.log(`  Scenario: ${desc}`);
        console.log(`    Total: ${total}, Years: ${years}, SS: ${ss}`);
        console.log(`    Upper Bound (hi): ${hi}, SS Boost: ${ssBoost}`);

        if (total <= 0) {
            console.log("    ✓ Zero-portfolio guard.");
        } else if (hi < rawMonthly + ss) {
            console.log("    ✗ Upper bound too low!");
            failures++;
        } else {
            console.log("    ✓ Upper bound sufficient.");
        }
    });

    console.log(`\n${'='.repeat(50)}`);
    if (failures > 0) {
        console.error(`${failures} bounds test(s) FAILED`);
        process.exit(1);
    } else {
        console.log(`All ${scenarios.length} bounds tests passed.`);
    }
}

testLogic();
