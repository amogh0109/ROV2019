var canvas = undefined;
var ctx = undefined;
var origin=undefined;

var Joints = undefined;
var Links = undefined;
var newPositions = [];
var backwardPositions = [];
var forwardPositions = [];


var radius =0;

var target = undefined;
var tolerance = 1;



class Point
{
    constructor(args)
    {
        this.x = args.x;
        this.y = args.y;
    }

    static Distance(P1,P2)
    {
        var x = P2.x - P1.x;
        var y = P2.y - P1.y;
        return Math.sqrt(x*x + y*y);
    }

    Magnitude()
    {
        var x = this.x;
        var y = this.y;
        return Math.sqrt(x*x + y*y);
    }
}


function drawAxes(origin) {  
    ctx.strokeStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(origin.x,0);
    ctx.lineTo(origin.x,canvas.height);
    ctx.stroke();
    ctx.closePath();
    ctx.strokeStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(0,origin.y);
    ctx.lineTo(canvas.width,origin.y);
    ctx.stroke();
    ctx.closePath();
}


class Joint
{
    constructor(x,y,size=5)
    {
        this.x = x;
        this.y = y;
        this.size =size;
        this.Angle = undefined;
    }

    draw()
    {
        ctx.fillStyle="yellow";
        ctx.beginPath();
        ctx.arc(origin.x + this.x,origin.y - this.y,this.size,0,2*Math.PI,false);
        ctx.fill();
        ctx.closePath();
        ctx.fillStyle="#000000";
    }

    setAngle(a)
    {
        this.Angle = a;
    }

    static DrawTarget()
    {
        ctx.fillStyle="#ffffff";
        ctx.beginPath();
        ctx.arc(origin.x + target.x,origin.y - target.y,5,0,2*Math.PI,false);
        ctx.fill();
        ctx.closePath();
        ctx.fillStyle="#000000";
    }
    
}

class Link
{
    constructor(n,n_next)
    {
        this.startPoint = n;
        this.endPoint = n_next;
        this.setlength(n_next,n);
        radius+=this.length;
    }

    setlength(n_next,n)
    {
       this.length = Point.Distance(n_next,n); 
    }

    draw()
    {
        ctx.lineWidth = 4; 
        ctx.beginPath();
        ctx.strokeStyle="#0010CC";
        ctx.moveTo(this.startPoint.x+origin.x,origin.y-this.startPoint.y);
        ctx.lineTo(this.endPoint.x+origin.x, origin.y-this.endPoint.y);
        ctx.stroke();
        ctx.closePath();
        ctx.strokeStyle="#000000";
        ctx.lineWidth = 2;
    }

}

$(document).ready(function () {
    canvas = document.getElementById("myCanvas");
    ctx = canvas.getContext("2d");
    origin = new Point({x:canvas.width/2,y:canvas.height/2});

    Joints = [new Joint(0,0),new Joint(50,0),new Joint(110,0),new Joint(180,0)];
    console.log(Joints);
    Links = [];
    var str="";
    $("#AngleConstraints").empty();
    for (let i = 0; i < Joints.length-1; i++) {
        Links.push(new Link(Joints[i],Joints[i+1]));
        if(i < Joints.length-2){
            str+="J"+(i+1)+"<input type='number' id='J"+(i+1)+"'><br>";
            $(document).on('change','#J'+(i+1),UpdateJointConstraints);
        }
    }
    $("#AngleConstraints").append(str);
    $("input").change(function(){
        var x = parseInt($("#x_coord").val());
        var y = parseInt($("#y_coord").val());
        if(x!=0 || y!=0)
        {
            target = new Point({x:x,y:y});
            alert("The target has been changed to ("+x+","+y+")");
        }
    });

    canvas.addEventListener('mousemove', function(evt) {
        var mousePos = getMousePos(canvas, evt);
        target = new Point({x: mousePos.x-origin.x,y:origin.y-mousePos.y});
    });    
    update();
});

function UpdateJointConstraints (event){  
    var index = parseInt(event.target.id.substring(1));
    Joints[index].setAngle(parseInt($("#"+event.target.id).val()));
}

function getMousePos(canvas, evt) {
	var rect = canvas.getBoundingClientRect();
	return {
		x: evt.clientX - rect.left,
		y: evt.clientY - rect.top
	};
}

function NextFrame()
{
    for(let i=0;i<Joints.length-1;i++)
    {
        if(newPositions.length != 0)
        {
            Joints[i+1].x = newPositions[i].x;
            Joints[i+1].y = newPositions[i].y;
        }
    }
    IK();
}

function GetAngle(node,point)
{
    var y = point.y-node.y;
    var x =point.x -node.x;
    return Math.atan2(-y,x);
}
function deg2rad(d)
{
    return d * (Math.PI/180);
}
function rad2deg(r)
{
    return r * (180/Math.PI);
}


function update()
{
    IK();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawAxes(origin);
    for(let i=1;i<Joints.length-1;i++)
    {
        if(Links[i].startPoint.Angle!=undefined)
        {
            var newPoint = {x:origin.x+Links[i].startPoint.x-(Links[i].endPoint.x-Links[i].startPoint.x),y: origin.y-Links[i].startPoint.y+(Links[i].endPoint.y-Links[i].startPoint.y)};
            var angle = GetAngle(Links[i].startPoint,Links[i].endPoint);

            ctx.strokeStyle="rgba(255,120,30,0.6)";
            ctx.fillStyle="rgba(0,125,125,0.6)";
            ctx.beginPath();
            ctx.arc(Links[i].startPoint.x+origin.x,origin.y-Links[i].startPoint.y,Links[i-1].length,angle+Math.PI-deg2rad(Links[i].startPoint.Angle),angle+Math.PI+deg2rad(Links[i].startPoint.Angle),false);
            ctx.stroke();
            ctx.closePath();
        }
    }
    Links.forEach(element=>{
        element.draw();
    });
    Joints.forEach(element=>{
        element.draw();
    });
    if(target!=undefined)
        Joint.DrawTarget();

    window.requestAnimationFrame(update);
}

function GetLinkAngles(L1,L2)
{
    var Reflection = new Point({x:2*L2.startPoint.x-L2.endPoint.x,y:2*L2.startPoint.y-L2.endPoint.y});
    var V1 = new Point({x:Reflection.x-L2.startPoint.x,y:Reflection.y-L2.startPoint.y});
    var V2 = new Point({x:L1.startPoint.x-L1.endPoint.x,y:L1.startPoint.y-L1.endPoint.y});

    return Math.acos((V1.x*V2.x + V1.y*V2.y)/(V1.Magnitude()*V2.Magnitude()));
}
function Line(P1,P2,P3)
{
    var p = (P1.y-P2.y)*P3.x + (P2.x-P1.x)*P3.y + (P1.x*P2.y-P2.y*P1.y)
    return p;
}

function IK()
{
    if(target!=undefined)
    {
        var dist = Point.Distance(Joints[0],target);
        if(dist>radius)
        {
            for (let i = 0; i <= Joints.length - 2; i++) {
                var r = Point.Distance(target,Joints[i]);
                var lambda = Links[i].length/r;
                Joints[i+1].x = (1-lambda)*Joints[i].x + lambda*target.x;
                Joints[i+1].y = (1-lambda)*Joints[i].y + lambda*target.y;
            }
        }
        else{
            var b = new Point({x:Joints[0].x,y:Joints[0].y});
            var dst = Point.Distance(Joints[Joints.length-1],target);
            if(dst>tolerance)
            {
                Joints[Joints.length-1].x = target.x;
                Joints[Joints.length-1].y = target.y;
                
                for(let i=Joints.length-2;i>0;i--)
                {
                    var Angle;
                    if(Joints[i].Angle !=undefined)
                    {
                        Angle = rad2deg(GetLinkAngles(Links[i-1],Links[i]));
                        console.log(Angle);
                    }
                    /* This section is commented because the constraints have not been implemented yet.*/
                    // TO DO: 
                    // 1. Rotational constraints in the algorithm
                    // 2. Make sure all the joints have the Joint angle restrictions
                    // if(Angle!=undefined && Angle > Joints[i].Angle)
                    // {
                    //     var Reflection = new Point({x:2*Links[i].startPoint.x-Links[i].endPoint.x,y:2*Links[i].startPoint.y-Links[i].endPoint.y});
                    //     console.log(Line(Joints[i],Reflection,Joints[i-1]));
                    // }
                    //else{
                        var r = Point.Distance(Joints[i+1],Joints[i]);
                        var lambda = Links[i].length/r;
                        Joints[i].x = (1-lambda)*Joints[i+1].x + lambda*Joints[i].x; 
                        Joints[i].y = (1-lambda)*Joints[i+1].y + lambda*Joints[i].y; 
                    //}
                }
                Joints[0].x = b.x;
                Joints[0].y = b.y;
                for(let i=0;i<Joints.length-1;i++)
                {
                    var r = Point.Distance(Joints[i+1],Joints[i]);
                    var lambda = Links[i].length/r;
                    Joints[i+1].x = (1-lambda)*Joints[i].x + lambda*Joints[i+1].x;
                    Joints[i+1].y = (1-lambda)*Joints[i].y + lambda*Joints[i+1].y;
                }
            }
        }
    }
}
