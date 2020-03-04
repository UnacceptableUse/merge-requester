const gitlab = require('gitlab');
const { readdirSync } = require('fs');
const {exec} = require('child_process');
const config = require('./config.json');
const projects = new gitlab.Projects(config.gitlab);
const issues = new gitlab.Issues(config.gitlab);
const mergeRequests = new gitlab.MergeRequests(config.gitlab);
const milestones = new gitlab.GroupMilestones(config.gitlab);
const groups = new gitlab.Groups(config.gitlab);
const branches = new gitlab.Branches(config.gitlab);
const users = new gitlab.Users(config.gitlab);


async function init(){
    const projectName = process.argv[2];
    const title = process.argv.splice(3).join(" ");

    if(!projectName)
        return console.error("No project name supplied.");

    if(!title)
        return console.error("No issue title supplied");

    const user = await users.current();
    console.log(`Token is for ${user.name} (ID ${user.id})`);

    const searchResult = await projects.search(projectName);

    let project;
    for(let i = 0; i < searchResult.length; i++){
        let result = searchResult[i];
        if(result.path.toLowerCase() === projectName) {
            project = result;
            break;
        }
    }
    if(!project)
        return console.error(`Unable to find project with name '${projectName}'`);
    const milestone_id = await getMilestoneId("Development");

    console.log(`Matched project name ${project.name}`);

    const issue = await issues.create(project.id, {title, milestone_id, assignee_id: user.id});

    console.log(`Created issue #${issue.iid} (${title})`);

    const branch = await branches.create(project.id, issue.iid+"-"+title.toLowerCase().replace(/ /g, "-"), project.default_branch);

    console.log(`Created branch ${branch.name}`);

    let mergeRequest = await mergeRequests.create(project.id, branch.name, project.default_branch, title, {assignee_id: user.id, description: `Closes #${issue.iid}`, milestone_id});

    console.log(`Created merge request !${mergeRequest.iid}`);

    let dir = findProjectLocally(project.path);

    if(!dir)
        return console.error("Could not checkout branch - it is not anywhere locally");

    console.log(`Found project at ${dir}`);

    console.log(await promiseExec(dir,"git fetch"));
    console.log(await promiseExec(dir, `git checkout ${branch.name}`));
}


async function promiseExec(cwd, command){
    console.log(cwd);
    return new Promise(function(fulfill, reject){
        exec(command, {cwd, shell: true}, function(error, stdout){
            if(error)
                return reject(error);
            fulfill(stdout);
        });
    })
}

function findProjectLocally(project){
    let php = findProject(config.projectDirectory, project);
    if(php)
        return config.projectDirectory+"/"+php;

    console.log(`${project} is not a PHP project.`);

    for (let i = 0; i < config.goDirectory.length; i++){
        let go = findProject(config.goDirectory[i], project);
        if(go)
            return config.goDirectory[i]+"/"+go;
        console.log(`${project} is not a Go project.`);
    }

    return null;
}


function findProject(directory, target){
    let res = readdirSync(directory, { withFileTypes: true }).filter(dirent => dirent.isDirectory() && dirent.name.toLowerCase() === target.toLowerCase());
    if(res[0])
        return res[0].name;
    return null;
}

async function getMilestoneId(name){
    let groupId = (await groups.all())[0].id;
    let milestoneList = await milestones.all(groupId);

    for(let i = 0; i < milestoneList.length; i++){
        let milestone = milestoneList[i];
        if(milestone.title === name)
            return milestone.id;
    }
    return null;
}

init();

