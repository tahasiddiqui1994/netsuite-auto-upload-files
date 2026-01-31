const SuiteCloudJestUnitTestRunner = require("@oracle/suitecloud-unit-testing/services/SuiteCloudJestUnitTestRunner");

module.exports = {
    defaultProjectFolder: "src",
    commands: {
        "project:deploy": {
            beforeExecuting: async args => {
                return args;
            },
            onCompleted: async args => {
                console.log("\n✅ RESTlet deployed successfully!");
                console.log("\n📋 Next steps:");
                console.log("   1. Go to: Customization → Scripting → Script Deployments");
                console.log("   2. Find: 'Auto Upload RESTlet Deployment'");
                console.log("   3. Copy the 'External URL'");
                console.log("   4. Add it to your project's .env file as NS_RESTLET_URL\n");
                return args;
            },
            onError: async args => {
                console.error("❌ Deployment failed. Check the error above.");
                return args;
            }
        }
    }
};
